-- CreateTable
CREATE TABLE "BiometricConsent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BiometricConsent_studentId_key" ON "BiometricConsent"("studentId");

-- CreateIndex
CREATE INDEX "BiometricConsent_studentId_idx" ON "BiometricConsent"("studentId");

-- CreateIndex
CREATE INDEX "BiometricConsent_status_idx" ON "BiometricConsent"("status");

-- AddForeignKey
ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
