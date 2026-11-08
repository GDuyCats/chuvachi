-- CreateTable
CREATE TABLE "CustomerPushSubscription" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "customerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPushWatch" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPushWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPushSubscription_endpoint_key" ON "CustomerPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "CustomerPushSubscription_customerId_idx" ON "CustomerPushSubscription"("customerId");

-- CreateIndex
CREATE INDEX "OrderPushWatch_orderId_idx" ON "OrderPushWatch"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPushWatch_subscriptionId_orderId_key" ON "OrderPushWatch"("subscriptionId", "orderId");

-- AddForeignKey
ALTER TABLE "CustomerPushSubscription" ADD CONSTRAINT "CustomerPushSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPushWatch" ADD CONSTRAINT "OrderPushWatch_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPushWatch" ADD CONSTRAINT "OrderPushWatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
