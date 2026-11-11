import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizePhone, PHONE_PATTERN } from "../lib/phone";
import { prisma } from "../lib/prisma";
import { notifyCustomerEdited } from "./notifications";
import { CUSTOMER_EDITABLE, MAX_CUSTOMER_EDITS } from "./order-service";

const FIELDS = ["customerName", "customerPhone", "address", "deliveryZoneId", "note"] as const;
type Field = (typeof FIELDS)[number];

// Every field is optional: only the ones sent are changed.
export const contactChangesSchema = z.object({
  customerName: z.string().trim().min(1).max(100).optional(),
  customerPhone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((value) => PHONE_PATTERN.test(value), "Invalid phone number")
    .optional(),
  address: z.string().trim().min(5).max(300).optional(),
  deliveryZoneId: z.number().int().positive().optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null)),
});
export type ContactChanges = z.infer<typeof contactChangesSchema>;

export class OrderEditError extends Error {
  constructor(
    public readonly code: "ORDER_NOT_FOUND" | "EDIT_LOCKED" | "EDIT_LIMIT" | "ORDER_ERASED" | "INVALID_ZONE" | "NO_CHANGES",
    public readonly status: number,
  ) {
    super(code);
  }
}

type Editor = { kind: "customer" } | { kind: "staff"; adminUserId: number };

// Changes the contact details of an order and writes the old and new values in its history.
// Returns the phone number the order has afterwards (a guest needs it to keep looking the order up).
export async function editOrderContact(code: string, changes: ContactChanges, editor: Editor): Promise<{ phone: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { code: code.toUpperCase() }, include: { deliveryZone: true } });
    if (!order) throw new OrderEditError("ORDER_NOT_FOUND", 404);
    if (order.anonymizedAt) throw new OrderEditError("ORDER_ERASED", 409);
    if (editor.kind === "customer") {
      if (!CUSTOMER_EDITABLE.includes(order.status)) throw new OrderEditError("EDIT_LOCKED", 409);
      if (order.customerEditCount >= MAX_CUSTOMER_EDITS) throw new OrderEditError("EDIT_LIMIT", 409);
    }

    // Only the fields whose value really changes.
    const before: Record<Field, string | number | null> = {
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.address,
      deliveryZoneId: order.deliveryZoneId,
      note: order.note,
    };
    const changed = FIELDS.filter((field) => changes[field] !== undefined && changes[field] !== before[field]);
    if (changed.length === 0) throw new OrderEditError("NO_CHANGES", 400);

    let newZoneName: string | null = null;
    if (changed.includes("deliveryZoneId")) {
      const zone = await tx.deliveryZone.findFirst({ where: { id: changes.deliveryZoneId, isActive: true } });
      if (!zone) throw new OrderEditError("INVALID_ZONE", 400);
      newZoneName = zone.nameVi;
    }

    const data: Prisma.OrderUncheckedUpdateManyInput = {};
    if (changed.includes("customerName")) data.customerName = changes.customerName;
    if (changed.includes("customerPhone")) data.customerPhone = changes.customerPhone;
    if (changed.includes("address")) data.address = changes.address;
    if (changed.includes("deliveryZoneId")) data.deliveryZoneId = changes.deliveryZoneId;
    if (changed.includes("note")) data.note = changes.note;
    const updated = await tx.order.updateMany({
      // For customers, re-check the status in the same step so a change can't slip in while staff move the order on.
      where:
        editor.kind === "customer"
          ? { id: order.id, status: { in: CUSTOMER_EDITABLE }, customerEditCount: { lt: MAX_CUSTOMER_EDITS } }
          : { id: order.id },
      data:
        editor.kind === "customer"
          ? { ...data, customerEditCount: { increment: 1 }, customerEditedAt: new Date() }
          : data,
    });
    if (updated.count === 0) throw new OrderEditError("EDIT_LOCKED", 409);

    // History: [field, old value, new value] for each change (zones by name, easier to read).
    const shown = (field: Field, value: string | number | null | undefined) =>
      field === "deliveryZoneId" ? (value === order.deliveryZoneId ? order.deliveryZone.nameVi : newZoneName) : (value ?? "");
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        action: editor.kind === "customer" ? "CUSTOMER_EDIT" : "EDIT",
        adminUserId: editor.kind === "staff" ? editor.adminUserId : null,
        note: JSON.stringify(changed.map((field) => [field, shown(field, before[field]), shown(field, changes[field])])),
      },
    });
    return { phone: (changes.customerPhone as string | undefined) ?? order.customerPhone, changed, code: order.code };
  });

  if (editor.kind === "customer") {
    void notifyCustomerEdited(result.code, result.changed).catch((error: unknown) =>
      console.error("Customer edit notification failed:", error),
    );
  }
  return { phone: result.phone };
}
