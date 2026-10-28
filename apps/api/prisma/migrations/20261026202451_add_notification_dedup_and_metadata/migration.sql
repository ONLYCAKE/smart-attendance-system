-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupKey" TEXT,
ADD COLUMN     "metadata" TEXT;

-- CreateIndex
CREATE INDEX "Notification_studentId_dedupKey_idx" ON "Notification"("studentId", "dedupKey");
