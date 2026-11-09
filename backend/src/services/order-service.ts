import { DeliveryType, OptionType, PaymentMethod, Prisma, ProductOption, ShopSetting } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { type Locale, pickText } from "../lib/locale";
import { generateOrderCode } from "../lib/order-code";
import { normalizePhone } from "../lib/phone";
import { daysBetween, formatDateOnly, parseDateOnly, slotStartTime, vietnamTimeOn, vietnamToday } from "../lib/time";
import { PRIVACY_POLICY_VERSION } from "../lib/privacy";

// An error the customer can fix (bad date, day fully booked, ...).
// "code" is stable so the frontend can show a translated message.
export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly product?: string, // the cake the problem is about, in the customer's language
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
  deliveryType: DeliveryType;
  deliveryDate?: string; // required for SCHEDULED
  deliverySlot?: string; // required for SCHEDULED
  locale: "vi" | "en";
  privacyConsent: true;
  customerId: number | null; // signed-in customer, or null for a guest
  items: {
    productSlug: string;
    flavorOptionId?: number | null;
    packageOptionId?: number | null;
    quantity: number;
    note?: string;
  }[];
};

const MAX_CODE_ATTEMPTS = 3;
const HOUR_MS = 60 * 60 * 1000;

// Finds the chosen option of one type, making sure it belongs to the product.
// If the product has options of that type, the customer must choose one.
function pickOption(
  options: ProductOption[],
  type: OptionType,
  optionId: number | null | undefined,
  productSlug: string,
): ProductOption | null {
  const available = options.filter((option) => option.type === type && option.isActive);
  if (available.length === 0) {
    return null;
  }

  const chosen = available.find((option) => option.id === optionId);
  if (!chosen) {
    throw new OrderError("INVALID_OPTION", `Product ${productSlug} needs a valid ${type.toLowerCase()} option`);
  }
  return chosen;
}

// Works out the delivery day (and slot for scheduled orders) and checks it against the shop rules.
function resolveDelivery(
  input: CreateOrderInput,
  settings: ShopSetting,
  isLargeOrder: boolean,
): { deliveryDate: Date; deliverySlot: string | null } {
  const leadHours = isLargeOrder ? settings.largeOrderLeadHours : settings.smallOrderLeadHours;
  const now = Date.now();

  if (input.deliveryType === DeliveryType.ASAP) {
    // Large orders need a day of preparation, so they must be scheduled.
    if (isLargeOrder) {
      throw new OrderError("ASAP_NOT_FOR_LARGE_ORDER", "Orders of this size must be scheduled for a later day");
    }
    const today = vietnamToday();
    if (settings.closedWeekdays.includes(today.getUTCDay())) {
      throw new OrderError("SHOP_CLOSED", "The shop is closed today");
    }
    // The cakes must be ready before closing time.
    const openAt = vietnamTimeOn(today, settings.openTime).getTime();
    const closeAt = vietnamTimeOn(today, settings.closeTime).getTime();
    const readyAt = Math.max(now, openAt) + leadHours * HOUR_MS;
    if (readyAt > closeAt) {
      throw new OrderError("ASAP_UNAVAILABLE", "It's too late for today. Please schedule a delivery");
    }
    return { deliveryDate: today, deliverySlot: null };
  }

  // Scheduled delivery: a valid day and slot, far enough in the future.
  const deliveryDate = input.deliveryDate ? parseDateOnly(input.deliveryDate) : null;
  if (!deliveryDate) {
    throw new OrderError("INVALID_DATE", "Delivery date is not a valid date");
  }
  if (!input.deliverySlot || !settings.deliverySlots.includes(input.deliverySlot)) {
    throw new OrderError("INVALID_SLOT", "Delivery slot is not available");
  }
  if (settings.closedWeekdays.includes(deliveryDate.getUTCDay())) {
    throw new OrderError("SHOP_CLOSED", "The shop is closed on this day");
  }
  const daysAhead = daysBetween(vietnamToday(), deliveryDate);
  if (daysAhead < 0 || daysAhead > settings.maxDaysAhead) {
    throw new OrderError("DATE_OUT_OF_RANGE", `Orders can be placed up to ${settings.maxDaysAhead} days ahead`);
  }
  if (slotStartTime(deliveryDate, input.deliverySlot).getTime() < now + leadHours * HOUR_MS) {
    throw new OrderError(
      isLargeOrder ? "LEAD_TIME_LARGE_ORDER" : "LEAD_TIME_SMALL_ORDER",
      `This order must be placed at least ${leadHours} hours before delivery`,
    );
  }
  return { deliveryDate, deliverySlot: input.deliverySlot };
}

export async function createOrder(input: CreateOrderInput) {
  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new OrderError("SHOP_NOT_CONFIGURED", "Shop settings are missing", 500);
  }
  if (settings.orderingPaused) {
    throw new OrderError("ORDERING_PAUSED", "The shop is not taking orders right now", 409);
  }

  // 1. Delivery area (no fee: customers pay the driver directly)
  const zone = await prisma.deliveryZone.findFirst({
    where: { id: input.deliveryZoneId, isActive: true },
  });
  if (!zone) {
    throw new OrderError("INVALID_ZONE", "We don't deliver to this area yet");
  }

  // 2. Products and prices (always recalculated from the database)
  const productSlugs = [...new Set(input.items.map((item) => item.productSlug))];
  const products = await prisma.product.findMany({
    where: { slug: { in: productSlugs }, isActive: true },
    include: { options: true },
  });
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));

  let total = 0;
  let totalPortions = 0;

  const itemsData = input.items.map((item) => {
    const product = productsBySlug.get(item.productSlug);
    if (!product) {
      throw new OrderError("INVALID_PRODUCT", `Product ${item.productSlug} is not available`);
    }

    const name = pickText(input.locale, product.nameVi, product.nameEn);
    if (item.quantity > settings.maxQuantityPerItem) {
      throw new OrderError(
        "QUANTITY_TOO_HIGH",
        `At most ${settings.maxQuantityPerItem} of ${product.slug} per order`,
        400,
        name,
      );
    }
    if (product.availability !== "AVAILABLE") {
      throw new OrderError(
        product.availability === "COMING_SOON" ? "PRODUCT_COMING_SOON" : "PRODUCT_UNAVAILABLE",
        `${product.slug} can't be ordered right now`,
        409,
        name,
      );
    }

    const flavor = pickOption(product.options, OptionType.FLAVOR, item.flavorOptionId, product.slug);
    const packaging = pickOption(product.options, OptionType.PACKAGE, item.packageOptionId, product.slug);
    for (const option of [flavor, packaging]) {
      if (option && option.availability !== "AVAILABLE") {
        throw new OrderError(
          option.availability === "COMING_SOON" ? "PRODUCT_COMING_SOON" : "PRODUCT_UNAVAILABLE",
          `${product.slug} option ${option.id} can't be ordered right now`,
          409,
          `${name} – ${pickText(input.locale, option.nameVi, option.nameEn)}`,
        );
      }
    }

    const portionsPerUnit = packaging?.portions ?? 1;
    // unit price = (base price + flavor extra) * portions in the package + package adjustment
    const unitPrice =
      (product.basePrice + (flavor?.priceDelta ?? 0)) * portionsPerUnit + (packaging?.priceDelta ?? 0);
    const portions = portionsPerUnit * item.quantity;

    total += unitPrice * item.quantity;
    totalPortions += portions;

    return {
      productId: product.id,
      nameSnapshot: product.nameVi,
      optionsSnapshot: {
        product: { nameVi: product.nameVi, nameEn: product.nameEn },
        flavor: flavor ? { id: flavor.id, nameVi: flavor.nameVi, nameEn: flavor.nameEn } : null,
        package: packaging ? { id: packaging.id, nameVi: packaging.nameVi, nameEn: packaging.nameEn } : null,
      },
      unitPrice,
      quantity: item.quantity,
      portions,
      flavorOptionId: flavor?.id ?? null,
      note: item.note,
    };
  });

  // 3. Delivery day and lead time
  const isLargeOrder = totalPortions >= settings.largeOrderThreshold;
  const { deliveryDate, deliverySlot } = resolveDelivery(input, settings, isLargeOrder);

  // 3b. Cakes marked "temporarily sold out" up to and including some day
  const productName = (product: { nameVi: string; nameEn: string }) => pickText(input.locale, product.nameVi, product.nameEn);
  for (const product of products) {
    if (product.soldOutUntil && deliveryDate.getTime() <= product.soldOutUntil.getTime()) {
      throw new OrderError("PRODUCT_SOLD_OUT", `${product.slug} is sold out for this day`, 409, productName(product));
    }
  }

  // Portions per cake, for cakes with their own daily limit
  const portionsByProduct = new Map<number, number>();
  for (const item of itemsData) {
    portionsByProduct.set(item.productId, (portionsByProduct.get(item.productId) ?? 0) + item.portions);
  }
  const limitedProducts = products.filter((product) => product.dailyLimit !== null);

  // Portions per flavor, for flavors with their own daily limit (e.g. "mango: 10 a day")
  const portionsByFlavor = new Map<number, number>();
  for (const item of itemsData) {
    if (item.flavorOptionId !== null) {
      portionsByFlavor.set(item.flavorOptionId, (portionsByFlavor.get(item.flavorOptionId) ?? 0) + item.portions);
    }
  }
  const limitedFlavors = products.flatMap((product) =>
    product.options
      .filter((option) => option.dailyLimit !== null && portionsByFlavor.has(option.id))
      .map((option) => ({ option, product })),
  );

  // 4. Reserve capacity and save the order in one transaction,
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

        // Same idea per cake: the update only succeeds while the cake's own limit has room.
        for (const product of limitedProducts) {
          const portions = portionsByProduct.get(product.id) ?? 0;
          await tx.productDayBooking.createMany({
            data: [{ productId: product.id, date: deliveryDate }],
            skipDuplicates: true,
          });
          const booked = await tx.$executeRaw`
            UPDATE "ProductDayBooking"
            SET "bookedPortions" = "bookedPortions" + ${portions}
            WHERE "productId" = ${product.id}
              AND "date" = ${formatDateOnly(deliveryDate)}::date
              AND "bookedPortions" + ${portions} <= ${product.dailyLimit}
          `;
          if (booked === 0) {
            throw new OrderError("PRODUCT_LIMIT_REACHED", `${product.slug} is fully booked for this day`, 409, productName(product));
          }
        }

        // And per flavor.
        for (const { option, product } of limitedFlavors) {
          const portions = portionsByFlavor.get(option.id) ?? 0;
          await tx.productOptionDayBooking.createMany({
            data: [{ optionId: option.id, date: deliveryDate }],
            skipDuplicates: true,
          });
          const booked = await tx.$executeRaw`
            UPDATE "ProductOptionDayBooking"
            SET "bookedPortions" = "bookedPortions" + ${portions}
            WHERE "optionId" = ${option.id}
              AND "date" = ${formatDateOnly(deliveryDate)}::date
              AND "bookedPortions" + ${portions} <= ${option.dailyLimit}
          `;
          if (booked === 0) {
            throw new OrderError(
              "FLAVOR_LIMIT_REACHED",
              `${product.slug} flavor ${option.id} is fully booked for this day`,
              409,
              `${productName(product)} – ${pickText(input.locale, option.nameVi, option.nameEn)}`,
            );
          }
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
            deliveryType: input.deliveryType,
            deliveryDate,
            deliverySlot,
            totalPortions,
            total,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            privacyConsentAt: new Date(),
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
            customerId: input.customerId,
            items: { create: itemsData },
          },
        });
      });

      return {
        code: order.code,
        status: order.status,
        deliveryType: order.deliveryType,
        deliveryDate: formatDateOnly(order.deliveryDate),
        deliverySlot: order.deliverySlot,
        totalPortions: order.totalPortions,
        total: order.total,
        unpaidCancelMinutes: settings.unpaidCancelMinutes,
        bankTransfer: {
          bankBin: settings.bankBin,
          bankName: settings.bankName,
          accountNumber: settings.bankAccountNumber,
          accountName: settings.bankAccountName,
          amount: order.total,
          transferContent: order.code,
        },
      };
    } catch (error) {
      // Very rarely the random order code already exists; try again with a new one.
      const isDuplicateCode = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (isDuplicateCode && attempt < MAX_CODE_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  throw new OrderError("ORDER_FAILED", "Could not create the order, please try again", 500);
}

// Looks up an order by code. The phone number must match, so strangers cannot read other orders.
export async function findOrderForCustomer(code: string, phone: string, locale: Locale) {
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
    customerName: order.customerName,
    // Only part of the address is shown, in case someone else learns the code and phone number.
    address: maskAddress(order.address),
    deliveryZone: pickText(locale, order.deliveryZone.nameVi, order.deliveryZone.nameEn),
    deliveryType: order.deliveryType,
    deliveryDate: formatDateOnly(order.deliveryDate),
    deliverySlot: order.deliverySlot,
    totalPortions: order.totalPortions,
    total: order.total,
    cancelReason: order.cancelReason,
    cancelNote: order.cancelNote,
    items: order.items.map((item) => ({
      name: describeItem(item.nameSnapshot, item.optionsSnapshot, locale),
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      portions: item.portions,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

type NamePair = { nameVi: string; nameEn: string };

function isNamePair(value: unknown): value is NamePair {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as NamePair).nameVi === "string" &&
    typeof (value as NamePair).nameEn === "string"
  );
}

// Builds "Panna cotta · Mango · Box of 4" in the customer's language from the saved snapshot.
export function describeItem(fallbackName: string, snapshot: Prisma.JsonValue, locale: Locale): string {
  const data = (
    typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot) ? snapshot : {}
  ) as Record<string, unknown>;
  const parts = [data.product, data.flavor, data.package]
    .filter(isNamePair)
    .map((pair) => pickText(locale, pair.nameVi, pair.nameEn));
  return parts.length > 0 ? parts.join(" · ") : fallbackName;
}

// "12 Le Loi Street, Ben Nghe Ward" -> "12 Le***"
function maskAddress(address: string): string {
  const visible = address.slice(0, Math.min(6, Math.ceil(address.length / 3)));
  return `${visible}***`;
}
