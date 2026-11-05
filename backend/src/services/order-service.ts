import { OptionType, PaymentMethod, Prisma, ProductOption } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { generateOrderCode } from "../lib/order-code";
import { normalizePhone } from "../lib/phone";
import { daysBetween, formatDateOnly, parseDateOnly, slotStartTime, vietnamToday } from "../lib/time";

// An error the customer can fix (bad date, day fully booked, ...).
// "code" is stable so the frontend can show a translated message.
export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  address: string;
  note?: string;
  deliveryZoneId: number;
  deliveryDate: string;
  deliverySlot: string;
  paymentMethod: PaymentMethod;
  locale: "vi" | "en";
  items: {
    productId: number;
    flavorOptionId?: number;
    packageOptionId?: number;
    quantity: number;
    note?: string;
  }[];
};

const MAX_CODE_ATTEMPTS = 3;

// Finds the chosen option of one type, making sure it belongs to the product.
// If the product has options of that type, the customer must choose one.
function pickOption(
  options: ProductOption[],
  type: OptionType,
  optionId: number | undefined,
  productId: number,
): ProductOption | null {
  const available = options.filter((option) => option.type === type && option.isActive);
  if (available.length === 0) {
    return null;
  }

  const chosen = available.find((option) => option.id === optionId);
  if (!chosen) {
    throw new OrderError("INVALID_OPTION", `Product ${productId} needs a valid ${type.toLowerCase()} option`);
  }
  return chosen;
}

export async function createOrder(input: CreateOrderInput) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new OrderError("SHOP_NOT_CONFIGURED", "Shop settings are missing", 500);
  }

  // 1. Delivery date and slot
  const deliveryDate = parseDateOnly(input.deliveryDate);
  if (!deliveryDate) {
    throw new OrderError("INVALID_DATE", "Delivery date is not a valid date");
  }
  if (!settings.deliverySlots.includes(input.deliverySlot)) {
    throw new OrderError("INVALID_SLOT", "Delivery slot is not available");
  }
  if (settings.closedWeekdays.includes(deliveryDate.getUTCDay())) {
    throw new OrderError("SHOP_CLOSED", "The shop is closed on this day");
  }
  const daysAhead = daysBetween(vietnamToday(), deliveryDate);
  if (daysAhead < 0 || daysAhead > settings.maxDaysAhead) {
    throw new OrderError("DATE_OUT_OF_RANGE", `Orders can be placed up to ${settings.maxDaysAhead} days ahead`);
  }

  // 2. Delivery zone
  const zone = await prisma.deliveryZone.findFirst({
    where: { id: input.deliveryZoneId, isActive: true },
  });
  if (!zone) {
    throw new OrderError("INVALID_ZONE", "Delivery zone is not available");
  }

  // 3. Products and prices (always recalculated from the database)
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { options: true },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));

  let subtotal = 0;
  let totalPortions = 0;

  const itemsData = input.items.map((item) => {
    const product = productsById.get(item.productId);
    if (!product) {
      throw new OrderError("INVALID_PRODUCT", `Product ${item.productId} is not available`);
    }

    const flavor = pickOption(product.options, OptionType.FLAVOR, item.flavorOptionId, product.id);
    const packaging = pickOption(product.options, OptionType.PACKAGE, item.packageOptionId, product.id);

    const portionsPerUnit = packaging?.portions ?? 1;
    // unit price = (base price + flavor extra) * portions in the package + package adjustment
    const unitPrice =
      (product.basePrice + (flavor?.priceDelta ?? 0)) * portionsPerUnit + (packaging?.priceDelta ?? 0);
    const portions = portionsPerUnit * item.quantity;

    subtotal += unitPrice * item.quantity;
    totalPortions += portions;

    return {
      productId: product.id,
      nameSnapshot: product.nameVi,
      optionsSnapshot: {
        flavor: flavor ? { id: flavor.id, nameVi: flavor.nameVi, nameEn: flavor.nameEn } : null,
        package: packaging ? { id: packaging.id, nameVi: packaging.nameVi, nameEn: packaging.nameEn } : null,
      },
      unitPrice,
      quantity: item.quantity,
      portions,
      note: item.note,
    };
  });

  // 4. Lead time: large orders need more time to prepare
  const isLargeOrder = totalPortions >= settings.largeOrderThreshold;
  const leadHours = isLargeOrder ? settings.largeOrderLeadHours : settings.smallOrderLeadHours;
  const earliestAllowed = new Date(Date.now() + leadHours * 60 * 60 * 1000);
  if (slotStartTime(deliveryDate, input.deliverySlot) < earliestAllowed) {
    throw new OrderError(
      isLargeOrder ? "LEAD_TIME_LARGE_ORDER" : "LEAD_TIME_SMALL_ORDER",
      `This order must be placed at least ${leadHours} hours before delivery`,
    );
  }

  const shippingFee = zone.fee;
  const total = subtotal + shippingFee;

  // 5 + 6. Reserve capacity and save the order in one transaction,
  // so two customers ordering at the same time cannot overbook a day.
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        await tx.dailyCapacity.createMany({
          data: [{ date: deliveryDate, maxPortions: settings.defaultDailyCapacity }],
          skipDuplicates: true,
        });

        const reserved = await tx.$executeRaw`
          UPDATE "DailyCapacity"
          SET "bookedPortions" = "bookedPortions" + ${totalPortions}
          WHERE "date" = ${formatDateOnly(deliveryDate)}::date
            AND "bookedPortions" + ${totalPortions} <= "maxPortions"
        `;
        if (reserved === 0) {
          throw new OrderError("DAY_FULLY_BOOKED", "This day is fully booked, please choose another day", 409);
        }

        return tx.order.create({
          data: {
            code: generateOrderCode(),
            customerName: input.customerName,
            customerPhone: normalizePhone(input.customerPhone),
            address: input.address,
            note: input.note,
            locale: input.locale,
            deliveryZoneId: zone.id,
            deliveryDate,
            deliverySlot: input.deliverySlot,
            totalPortions,
            subtotal,
            shippingFee,
            total,
            paymentMethod: input.paymentMethod,
            items: { create: itemsData },
          },
        });
      });

      const needsTransfer = order.paymentMethod === PaymentMethod.BANK_TRANSFER;
      return {
        code: order.code,
        status: order.status,
        deliveryDate: formatDateOnly(order.deliveryDate),
        deliverySlot: order.deliverySlot,
        totalPortions: order.totalPortions,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
        paymentMethod: order.paymentMethod,
        bankTransfer: needsTransfer
          ? {
              bankName: settings.bankName,
              accountNumber: settings.bankAccountNumber,
              accountName: settings.bankAccountName,
              amount: order.total,
              transferContent: order.code,
            }
          : null,
      };
    } catch (error) {
      // Very rarely the random order code already exists; try again with a new one.
      const isDuplicateCode =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (isDuplicateCode && attempt < MAX_CODE_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  throw new OrderError("ORDER_FAILED", "Could not create the order, please try again", 500);
}

// Looks up an order by code. The phone number must match, so strangers cannot read other orders.
export async function findOrderForCustomer(code: string, phone: string) {
  const order = await prisma.order.findUnique({
    where: { code: code.toUpperCase() },
    include: { items: true, deliveryZone: true },
  });

  if (!order || order.customerPhone !== normalizePhone(phone)) {
    return null;
  }

  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerName: order.customerName,
    address: order.address,
    deliveryZone: { nameVi: order.deliveryZone.nameVi, nameEn: order.deliveryZone.nameEn },
    deliveryDate: formatDateOnly(order.deliveryDate),
    deliverySlot: order.deliverySlot,
    totalPortions: order.totalPortions,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      options: item.optionsSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      portions: item.portions,
      note: item.note,
    })),
    createdAt: order.createdAt,
  };
}
