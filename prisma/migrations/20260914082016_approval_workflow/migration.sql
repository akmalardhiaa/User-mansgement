-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'MANAGER_APPROVED', 'MANAGER_REJECTED', 'IT_APPROVED', 'IT_REJECTED', 'ACTIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT;

-- CreateTable
CREATE TABLE "UserApprovalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "department" TEXT NOT NULL,
    "notes" TEXT,
    "managerName" TEXT NOT NULL,
    "managerEmail" TEXT NOT NULL,
    "cisoName" TEXT NOT NULL,
    "cisoEmail" TEXT NOT NULL,
    "managerTokenHash" TEXT,
    "managerTokenExpiresAt" TIMESTAMP(3),
    "managerTokenUsedAt" TIMESTAMP(3),
    "cisoTokenHash" TEXT,
    "cisoTokenExpiresAt" TIMESTAMP(3),
    "cisoTokenUsedAt" TIMESTAMP(3),
    "managerApprovedAt" TIMESTAMP(3),
    "cisoApprovedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "requestedById" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalLog" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionBy" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserApprovalRequest_managerTokenHash_key" ON "UserApprovalRequest"("managerTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "UserApprovalRequest_cisoTokenHash_key" ON "UserApprovalRequest"("cisoTokenHash");

-- CreateIndex
CREATE INDEX "UserApprovalRequest_status_idx" ON "UserApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "UserApprovalRequest_userId_idx" ON "UserApprovalRequest"("userId");

-- CreateIndex
CREATE INDEX "ApprovalLog_approvalRequestId_timestamp_idx" ON "ApprovalLog"("approvalRequestId", "timestamp");

-- AddForeignKey
ALTER TABLE "UserApprovalRequest" ADD CONSTRAINT "UserApprovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApprovalRequest" ADD CONSTRAINT "UserApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalLog" ADD CONSTRAINT "ApprovalLog_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "UserApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
