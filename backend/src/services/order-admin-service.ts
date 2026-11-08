import { CancelReason, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatDateOnly } from "../lib/time";
import { notifyOrderChangeLater } from "./customer-push";
import { notifyAutoCancelled } from "./notifications";

// The normal path an order follows. Cancelling is possible from any step before "completed".
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.CONFIRMED, // payment received
  [OrderStatus.CONFIRMED]: OrderStatus.PREPARING,
  [OrderStatus.PREPARING]: OrderStatus.READY,
  [OrderStatus.READY]: OrderStatus.COMPLETED,
};

export class OrderActionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409,
  ) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;

// Gives back the order's portions to its delivery day, so other customers can book them.
async function releaseCapacity(tx: Tx, orderId: number, deliveryDate: Date, portions: number): Promise<void> {
  const day = formatDateOnly(deliveryDate);
  await tx.$executeRaw`
    UPDATE "DailyCapacity"
    SET "bookedPortions" = GREATEST("bookedPortions" - ${portions}, 0)
    WHERE "date" = ${day}::date
  `;
  // Also give back each cake's own daily limit (only cakes that have one keep a booking row).
  const items = await tx.orderItem.groupBy({
    by: ["productId"],
    where: { orderId, productId: { not: null } },
    _sum: { portions: true },
  });
  for (const item of items) {
    await tx.$executeRaw`
      UPDATE "ProductDayBooking"
      SET "bookedPortions" = GREATEST("bookedPortions" - ${item._sum.portions ?? 0}, 0)
      WHERE "productId" = ${item.productId} AND "date" = ${day}::date
    `;
  }
}

export type CancelDetails = {
  reason: CancelReason;
  note?: string | null; // shown to the customer
};

// Moves an order one step forward. "expectedStatus" is what the staff member saw on screen:
// if someone else already changed the order, nothing happens and they are asked to refresh.
export async function advanceOrder(code: string, expectedStatus: OrderStatus, adminUserId: number) {
  const next = NEXT_STATUS[expectedStatus];
  if (!next) {
    throw new OrderActionError("CANNOT_ADVANCE");
  }

  const order = await prisma.$transaction(async (tx) => {
    // Confirming an order means the bank transfer has arrived.
    const data: Prisma.OrderUpdateManyMutationInput =
      expectedStatus === OrderStatus.PENDING ? { status: next, paymentStatus: PaymentStatus.PAID } : { status: next };
    const updated = await tx.order.updateMany({ where: { code, status: expectedStatus }, data });
    if (updated.count === 0) {
      throw new OrderActionError("ORDER_CHANGED");
    }
    const order = await tx.order.findUniqueOrThrow({ where: { code } });
    await tx.orderEvent.create({
      data: { orderId: order.id, fromStatus: expectedStatus, toStatus: next, action: "ADVANCE", adminUserId },
    });
    return order;
  });
  notifyOrderChangeLater([order.id]); // tell the customer, after the change is saved
  return order;
}

async function cancelInTransaction(
  tx: Tx,
  code: string,
  expectedStatus: OrderStatus,
  action: string,
  adminUserId: number | null,
  details: CancelDetails,
) {
  if (expectedStatus === OrderStatus.COMPLETED || expectedStatus === OrderStatus.CANCELLED) {
    throw new OrderActionError("CANNOT_CANCEL");
  }
  const updated = await tx.order.updateMany({
    where: { code, status: expectedStatus },
    data: { status: OrderStatus.CANCELLED, cancelReason: details.reason, cancelNote: details.note ?? null },
  });
  if (updated.count === 0) {
    throw new OrderActionError("ORDER_CHANGED");
  }
  const order = await tx.order.findUniqueOrThrow({ where: { code } });
  await releaseCapacity(tx, order.id, order.deliveryDate, order.totalPortions);
  const note = [details.reason, details.note].filter(Boolean).join(": ");
  await tx.orderEvent.create({
    data: { orderId: order.id, fromStatus: expectedStatus, toStatus: OrderStatus.CANCELLED, action, note, adminUserId },
  });
  return order;
}

export async function cancelOrder(code: string, expectedStatus: OrderStatus, adminUserId: number, details: CancelDetails) {
  const order = await prisma.$transaction((tx) => cancelInTransaction(tx, code, expectedStatus, "CANCEL", adminUserId, details));
  notifyOrderChangeLater([order.id]);
  return order;
}

// ---------- Cancel many orders at once ----------

const OPEN_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY];

export type BulkFilter = { date: Date; productId: number | null };

// Orders still open for a delivery day, optionally only those containing one cake.
export function findOrdersToCancel(filter: BulkFilter) {
  return prisma.order.findMany({
    where: {
      deliveryDate: filter.date,
      status: { in: OPEN_STATUSES },
      ...(filter.productId ? { items: { some: { productId: filter.productId } } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { code: true, status: true, paymentStatus: true, total: true, customerName: true, customerPhone: true },
  });
}

// Cancels every matching order with the same reason. Each order is cancelled on its own,
// so one order changing at the same moment never blocks the others.
// Returns the cancelled orders; the paid ones need a refund.
export async function bulkCancel(filter: BulkFilter, adminUserId: number, details: CancelDetails) {
  const orders = await findOrdersToCancel(filter);
  const cancelled: typeof orders = [];
  for (const order of orders) {
    try {
      const done = await prisma.$transaction((tx) =>
        cancelInTransaction(tx, order.code, order.status, "BULK_CANCEL", adminUserId, details),
      );
      notifyOrderChangeLater([done.id]);
      cancelled.push(order);
    } catch (error) {
      if (!(error instanceof OrderActionError)) throw error;
    }
  }
  return cancelled;
}

// Records that money for a cancelled, paid order was sent back to the customer.
export async function markRefunded(code: string, adminUserId: number) {
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { code, status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PAID },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
    if (updated.count === 0) {
      throw new OrderActionError("CANNOT_REFUND");
    }
    const order = await tx.order.findUniqueOrThrow({ where: { code } });
    await tx.orderEvent.create({ data: { orderId: order.id, action: "REFUND", adminUserId } });
    return order;
  });
  notifyOrderChangeLater([order.id], "refunded");
  return order;
}

// Cancels orders that are still unpaid after the allowed time and frees their portions.
export async function cancelUnpaidOrders(): Promise<number> {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  if (!settings || settings.unpaidCancelMinutes <= 0) {
    return 0;
  }
  const cutoff = new Date(Date.now() - settings.unpaidCancelMinutes * 60 * 1000);
  const overdue = await prisma.order.findMany({
    where: { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.UNPAID, createdAt: { lt: cutoff } },
    select: { code: true },
    take: 100,
  });

  const cancelled: string[] = [];
  for (const { code } of overdue) {
    try {
      const done = await prisma.$transaction((tx) =>
        cancelInTransaction(tx, code, OrderStatus.PENDING, "AUTO_CANCEL", null, { reason: CancelReason.UNPAID_TIMEOUT }),
      );
      notifyOrderChangeLater([done.id]);
      cancelled.push(code);
    } catch (error) {
      // Staff confirmed it at the same moment: that's fine, skip it.
      if (!(error instanceof OrderActionError)) throw error;
    }
  }
  await notifyAutoCancelled(cancelled);
  return cancelled.length;
}
