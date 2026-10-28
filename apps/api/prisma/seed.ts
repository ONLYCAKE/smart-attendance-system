import { PrismaClient, Role, UserStatus, StudentStatus, SessionStatus, AttendanceStatus, AttendanceMethod } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting deterministic development database seed...");

  const defaultPasswordHash = await bcrypt.hash("Password@123", 10);

  // 1. System Settings
  console.log("Configuring System Settings...");
  await prisma.systemSetting.upsert({
    where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
    update: { value: "75" },
    create: {
      key: "LOW_ATTENDANCE_THRESHOLD_PERCENT",
      value: "75",
      description: "Default minimum attendance percentage required by institution policy",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "INSTITUTION_NAME" },
    update: { value: "Apex Institute of Engineering & Technology" },
    create: {
      key: "INSTITUTION_NAME",
      value: "Apex Institute of Engineering & Technology",
      description: "Display name of the academic institution",
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "TIMEZONE" },
    update: { value: "UTC" },
    create: {
      key: "TIMEZONE",
      value: "UTC",
      description: "Institutional display timezone",
    },
  });

  // 2. Users (Admin, Teachers, Student)
  console.log("Creating administrative and academic users...");
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@college.edu" },
    update: { status: UserStatus.ACTIVE, role: Role.ADMIN },
    create: {
      name: "System Administrator",
      email: "admin@college.edu",
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const teacherUser1 = await prisma.user.upsert({
    where: { email: "prof.sharma@college.edu" },
    update: { status: UserStatus.ACTIVE, role: Role.TEACHER },
    create: {
      name: "Prof. Rajesh Sharma",
      email: "prof.sharma@college.edu",
      passwordHash: defaultPasswordHash,
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
    },
  });

  const teacherUser2 = await prisma.user.upsert({
    where: { email: "prof.verma@college.edu" },
    update: { status: UserStatus.ACTIVE, role: Role.TEACHER },
    create: {
      name: "Prof. Anjali Verma",
      email: "prof.verma@college.edu",
      passwordHash: defaultPasswordHash,
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
    },
  });

  const studentUser1 = await prisma.user.upsert({
    where: { email: "student.aarav@college.edu" },
    update: { status: UserStatus.ACTIVE, role: Role.STUDENT },
    create: {
      name: "Aarav Patel",
      email: "student.aarav@college.edu",
      passwordHash: defaultPasswordHash,
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
    },
  });

  // 3. Academic Structure
  console.log("Configuring Academic Hierarchy (Department -> Year -> Class -> Subject)...");
  const cseDept = await prisma.department.upsert({
    where: { code: "CSE" },
    update: { name: "Computer Science & Engineering", active: true },
    create: {
      name: "Computer Science & Engineering",
      code: "CSE",
      active: true,
    },
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { label: "2025-2026" },
    update: { active: true },
    create: {
      label: "2025-2026",
      startDate: new Date("2025-07-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T23:59:59.000Z"),
      active: true,
    },
  });

  const classCohort = await prisma.class.upsert({
    where: {
      departmentId_academicYearId_semesterNumber_division: {
        departmentId: cseDept.id,
        academicYearId: academicYear.id,
        semesterNumber: 4,
        division: "A",
      },
    },
    update: { label: "CSE-Sem4-A", active: true },
    create: {
      departmentId: cseDept.id,
      academicYearId: academicYear.id,
      semesterNumber: 4,
      division: "A",
      label: "CSE-Sem4-A",
      active: true,
    },
  });

  const subjectDsa = await prisma.subject.upsert({
    where: {
      departmentId_code: {
        departmentId: cseDept.id,
        code: "CS401",
      },
    },
    update: { name: "Data Structures & Algorithms", active: true },
    create: {
      code: "CS401",
      name: "Data Structures & Algorithms",
      departmentId: cseDept.id,
      active: true,
    },
  });

  const subjectDbms = await prisma.subject.upsert({
    where: {
      departmentId_code: {
        departmentId: cseDept.id,
        code: "CS402",
      },
    },
    update: { name: "Database Management Systems", active: true },
    create: {
      code: "CS402",
      name: "Database Management Systems",
      departmentId: cseDept.id,
      active: true,
    },
  });

  // 4. Teacher Assignment & Timetable
  console.log("Configuring Teacher Assignment and Timetable...");
  const assignment1 = await prisma.teacherAssignment.upsert({
    where: {
      classId_subjectId: {
        classId: classCohort.id,
        subjectId: subjectDsa.id,
      },
    },
    update: { active: true, teacherUserId: teacherUser1.id },
    create: {
      teacherUserId: teacherUser1.id,
      classId: classCohort.id,
      subjectId: subjectDsa.id,
      active: true,
    },
  });

  // Timetable: Monday 09:00 - 10:00
  const existingTimetable = await prisma.timetableEntry.findFirst({
    where: {
      classId: classCohort.id,
      subjectId: subjectDsa.id,
      dayOfWeek: 1,
      startTime: "09:00",
    },
  });

  const timetableEntry =
    existingTimetable ||
    (await prisma.timetableEntry.create({
      data: {
        classId: classCohort.id,
        subjectId: subjectDsa.id,
        teacherAssignmentId: assignment1.id,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
        room: "Lab-301",
      },
    }));

  // 5. Students (Active approved student and Pending student)
  console.log("Seeding Students (Approved and Pending)...");
  const student1 = await prisma.student.upsert({
    where: { email: "student.aarav@college.edu" },
    update: {
      status: StudentStatus.ACTIVE,
      classId: classCohort.id,
      userId: studentUser1.id,
    },
    create: {
      userId: studentUser1.id,
      rollNumber: "CS001",
      name: "Aarav Patel",
      email: "student.aarav@college.edu",
      departmentId: cseDept.id,
      academicYearId: academicYear.id,
      classId: classCohort.id,
      status: StudentStatus.ACTIVE,
    },
  });

  await prisma.student.upsert({
    where: { email: "diya.shah@college.edu" },
    update: {
      status: StudentStatus.PENDING,
      classId: classCohort.id,
    },
    create: {
      rollNumber: "CS002",
      name: "Diya Shah",
      email: "diya.shah@college.edu",
      departmentId: cseDept.id,
      academicYearId: academicYear.id,
      classId: classCohort.id,
      status: StudentStatus.PENDING,
    },
  });

  // 6. Face Enrollment (Deterministic mock vector for approved student)
  console.log("Configuring Face Enrollment with recorded consent...");
  // 128-dimensional mock normalized vector
  const mockDescriptor = Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.1));
  await prisma.faceEnrollment.upsert({
    where: { studentId: student1.id },
    update: {
      status: "ACTIVE",
      consentVersion: "1.0",
      descriptors: JSON.stringify(mockDescriptor),
    },
    create: {
      studentId: student1.id,
      provider: "human",
      modelVersion: "v1",
      descriptors: JSON.stringify(mockDescriptor),
      status: "ACTIVE",
      consentVersion: "1.0",
      consentedAt: new Date("2026-01-10T10:00:00.000Z"),
      enrolledAt: new Date("2026-01-10T10:05:00.000Z"),
    },
  });

  // 7. Lecture Session & Attendance Record
  console.log("Creating active lecture session and sample attendance record...");
  const existingSession = await prisma.attendanceSession.findFirst({
    where: {
      classId: classCohort.id,
      subjectId: subjectDsa.id,
      teacherUserId: teacherUser1.id,
      status: SessionStatus.ACTIVE,
    },
  });

  const session =
    existingSession ||
    (await prisma.attendanceSession.create({
      data: {
        timetableEntryId: timetableEntry.id,
        classId: classCohort.id,
        subjectId: subjectDsa.id,
        teacherUserId: teacherUser1.id,
        status: SessionStatus.ACTIVE,
        startsAt: new Date(),
      },
    }));

  await prisma.attendanceRecord.upsert({
    where: {
      studentId_sessionId: {
        studentId: student1.id,
        sessionId: session.id,
      },
    },
    update: {
      status: AttendanceStatus.PRESENT,
      method: AttendanceMethod.FACE_RECOGNITION,
      confidence: 0.94,
    },
    create: {
      studentId: student1.id,
      sessionId: session.id,
      status: AttendanceStatus.PRESENT,
      method: AttendanceMethod.FACE_RECOGNITION,
      confidence: 0.94,
      markedAt: new Date(),
    },
  });

  // 8. Audit Log
  await prisma.auditLog.create({
    data: {
      actorUserId: adminUser.id,
      action: "SEED_INITIALIZED",
      entityType: "System",
      entityId: "initial-setup",
      metadata: JSON.stringify({ environment: "development", seededAt: new Date().toISOString() }),
    },
  });

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
