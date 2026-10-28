-- DropIndex
DROP INDEX IF EXISTS "Subject_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "Subject_departmentId_code_key" ON "Subject"("departmentId", "code");
