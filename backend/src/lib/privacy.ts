import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { vietnamToday } from "./time";

// Date of the privacy policy text customers currently agree to.
// Change it whenever the policy pages change in a way that matters to customers.
export const PRIVACY_POLICY_VERSION = "2026-11-08";

// What is left in place of the customer's details once they are erased.
// Amounts, items and dates stay, because the shop needs them for its accounts.
const ERASED = {
  customerName: "(erased)",
  customerPhone: "",
  address: "",
  note: null,
} as const;

const FINISHED: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

// Erases the personal details of the matching finished orders and records it in each order's history.
async function eraseOrders(where: Prisma.OrderWhereInput, action: string, adminUserId: number | null): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { ...where, status: { in: FINISHED }, anonymizedAt: null },
      select: { id: true },
    });
    if (orders.length === 0) return 0;
    const ids = orders.map((o) => o.id);
    await tx.order.updateMany({ where: { id: { in: ids } }, data: { ...ERASED, anonymizedAt: new Date() } });
    await tx.orderItem.updateMany({ where: { orderId: { in: ids } }, data: { note: null } });
    await tx.orderPushWatch.deleteMany({ where: { orderId: { in: ids } } }); // browsers stop following these orders
    await tx.orderEvent.createMany({ data: ids.map((orderId) => ({ orderId, action, adminUserId })) });
    return ids.length;
  });
}

// Runs in the background: erases customer details of orders delivered longer ago than the shop's retention period.
export async function eraseExpiredCustomerData(): Promise<number> {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 }, select: { dataRetentionMonths: true } });
  const months = settings?.dataRetentionMonths ?? 12;
  const today = vietnamToday();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()));
  return eraseOrders({ deliveryDate: { lt: cutoff } }, "AUTO_ERASE", null);
}

export class EraseError extends Error {
  constructor(public readonly code: "ORDER_NOT_FOUND" | "ACTIVE_ORDERS" | "ALREADY_ERASED") {
    super(code);
  }
}

// A customer asked us to delete their data: erase every finished order with their phone number.
// Orders that are still running are refused, because the shop still needs the address to deliver.
export async function eraseCustomerOnRequest(orderCode: string, adminUserId: number): Promise<number> {
  const order = await prisma.order.findUnique({ where: { code: orderCode }, select: { customerPhone: true, anonymizedAt: true } });
  if (!order) throw new EraseError("ORDER_NOT_FOUND");
  if (order.anonymizedAt) throw new EraseError("ALREADY_ERASED");

  const active = await prisma.order.count({
    where: { customerPhone: order.customerPhone, status: { notIn: FINISHED } },
  });
  if (active > 0) throw new EraseError("ACTIVE_ORDERS");

  return eraseOrders({ customerPhone: order.customerPhone }, "ERASE_ON_REQUEST", adminUserId);
}
