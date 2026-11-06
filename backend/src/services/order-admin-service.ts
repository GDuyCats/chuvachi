import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatDateOnly } from "../lib/time";
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
async function releaseCapacity(tx: Tx, deliveryDate: Date, portions: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "DailyCapacity"
    SET "bookedPortions" = GREATEST("bookedPortions" - ${portions}, 0)
    WHERE "date" = ${formatDateOnly(deliveryDate)}::date
  `;
}

// Moves an order one step forward. "expectedStatus" is what the staff member saw on screen:
// if someone else already changed the order, nothing happens and they are asked to refresh.
export async function advanceOrder(code: string, expectedStatus: OrderStatus, adminUserId: number) {
  const next = NEXT_STATUS[expectedStatus];
  if (!next) {
    throw new OrderActionError("CANNOT_ADVANCE");
  }

  return prisma.$transaction(async (tx) => {
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
}

async function cancelInTransaction(
  tx: Tx,
  code: string,
  expectedStatus: OrderStatus,
  action: string,
  adminUserId: number | null,
  note?: string,
) {
  if (expectedStatus === OrderStatus.COMPLETED || expectedStatus === OrderStatus.CANCELLED) {
    throw new OrderActionError("CANNOT_CANCEL");
  }
  const updated = await tx.order.updateMany({
    where: { code, status: expectedStatus },
    data: { status: OrderStatus.CANCELLED },
  });
  if (updated.count === 0) {
    throw new OrderActionError("ORDER_CHANGED");
  }
  const order = await tx.order.findUniqueOrThrow({ where: { code } });
  await releaseCapacity(tx, order.deliveryDate, order.totalPortions);
  await tx.orderEvent.create({
    data: { orderId: order.id, fromStatus: expectedStatus, toStatus: OrderStatus.CANCELLED, action, note, adminUserId },
  });
  return order;
}

export function cancelOrder(code: string, expectedStatus: OrderStatus, adminUserId: number, note?: string) {
  return prisma.$transaction((tx) => cancelInTransaction(tx, code, expectedStatus, "CANCEL", adminUserId, note));
}

// Records that money for a cancelled, paid order was sent back to the customer.
export async function markRefunded(code: string, adminUserId: number) {
  return prisma.$transaction(async (tx) => {
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
      await prisma.$transaction((tx) =>
        cancelInTransaction(tx, code, OrderStatus.PENDING, "AUTO_CANCEL", null, "Unpaid after time limit"),
      );
      cancelled.push(code);
    } catch (error) {
      // Staff confirmed it at the same moment: that's fine, skip it.
      if (!(error instanceof OrderActionError)) throw error;
    }
  }
  await notifyAutoCancelled(cancelled);
  return cancelled.length;
}
