-- DropIndex
DROP INDEX IF EXISTS "TeacherAssignment_teacherUserId_classId_subjectId_key";

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAssignment_classId_subjectId_key" ON "TeacherAssignment"("classId", "subjectId");
