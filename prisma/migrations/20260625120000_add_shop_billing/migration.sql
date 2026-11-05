-- CreateTable
CREATE TABLE "ShopBilling" (
    "shop" TEXT NOT NULL,
    "hasActivePayment" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionId" TEXT,
    "subscriptionName" TEXT,
    "subscriptionStatus" TEXT,
    "planTier" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialDays" INTEGER,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "lastPaymentIssue" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopBilling_pkey" PRIMARY KEY ("shop")
);
