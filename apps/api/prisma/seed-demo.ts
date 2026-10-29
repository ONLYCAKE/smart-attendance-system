import "dotenv/config";
import { PrismaClient, Role, UserStatus, StudentStatus } from "@prisma/client";
import bcrypt from "bcrypt";

/**
 * Extra demo data: departments, classes, subjects, teachers, assignments,
 * a full weekly timetable and students. Idempotent and additive: it never
 * modifies rows created by prisma/seed.ts. Run `prisma:seed` first.
 */
const prisma = new PrismaClient();

const SEMESTER = 4;
// Monday-Friday, three one-hour periods per day.
const PERIODS = [
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["11:00", "12:00"],
] as const;

interface DeptSpec {
  code: string;
  name: string;
  rollPrefix: string;
  subjects: { code: string; name: string; teacherEmail: string }[];
  classes: { division: string; rollStart: number; students: number; pending: number }[];
}

const TEACHERS: Record<string, string> = {
  "prof.sharma@college.edu": "Prof. Rajesh Sharma",
  "prof.verma@college.edu": "Prof. Anjali Verma",
  "prof.singh@college.edu": "Prof. Vikram Singh",
  "prof.gupta@college.edu": "Prof. Neha Gupta",
  "prof.mehta@college.edu": "Prof. Sanjay Mehta",
  "prof.rao@college.edu": "Prof. Kavita Rao",
  "prof.joshi@college.edu": "Prof. Manish Joshi",
  "prof.nair@college.edu": "Prof. Pooja Nair",
  "prof.kulkarni@college.edu": "Prof. Arvind Kulkarni",
  "prof.desai@college.edu": "Prof. Sunita Desai",
  "prof.malhotra@college.edu": "Prof. Rohit Malhotra",
  "prof.iyer@college.edu": "Prof. Deepak Iyer",
  "prof.bhatt@college.edu": "Prof. Meera Bhatt",
  "prof.chauhan@college.edu": "Prof. Karan Chauhan",
};

const DEPARTMENTS: DeptSpec[] = [
  {
    code: "CSE",
    name: "Computer Science & Engineering",
    rollPrefix: "CS",
    subjects: [
      { code: "CS401", name: "Data Structures & Algorithms", teacherEmail: "prof.sharma@college.edu" },
      { code: "CS402", name: "Database Management Systems", teacherEmail: "prof.verma@college.edu" },
      { code: "CS403", name: "Operating Systems", teacherEmail: "prof.singh@college.edu" },
      { code: "CS404", name: "Computer Networks", teacherEmail: "prof.gupta@college.edu" },
      { code: "CS405", name: "Software Engineering", teacherEmail: "prof.mehta@college.edu" },
    ],
    classes: [
      { division: "A", rollStart: 3, students: 6, pending: 0 },
      { division: "B", rollStart: 101, students: 7, pending: 1 },
    ],
  },
  {
    code: "IT",
    name: "Information Technology",
    rollPrefix: "IT",
    subjects: [
      { code: "IT401", name: "Web Technologies", teacherEmail: "prof.rao@college.edu" },
      { code: "IT402", name: "Cloud Computing", teacherEmail: "prof.joshi@college.edu" },
      { code: "IT403", name: "Information Security", teacherEmail: "prof.nair@college.edu" },
      { code: "IT404", name: "Data Mining", teacherEmail: "prof.rao@college.edu" },
      { code: "IT405", name: "Mobile Application Development", teacherEmail: "prof.joshi@college.edu" },
    ],
    classes: [{ division: "A", rollStart: 1, students: 7, pending: 1 }],
  },
  {
    code: "ECE",
    name: "Electronics & Communication Engineering",
    rollPrefix: "EC",
    subjects: [
      { code: "EC401", name: "Analog Circuits", teacherEmail: "prof.kulkarni@college.edu" },
      { code: "EC402", name: "Digital Signal Processing", teacherEmail: "prof.desai@college.edu" },
      { code: "EC403", name: "Microprocessors & Microcontrollers", teacherEmail: "prof.malhotra@college.edu" },
      { code: "EC404", name: "Communication Systems", teacherEmail: "prof.kulkarni@college.edu" },
      { code: "EC405", name: "Electromagnetic Theory", teacherEmail: "prof.desai@college.edu" },
    ],
    classes: [{ division: "A", rollStart: 1, students: 7, pending: 1 }],
  },
  {
    code: "ME",
    name: "Mechanical Engineering",
    rollPrefix: "ME",
    subjects: [
      { code: "ME401", name: "Thermodynamics", teacherEmail: "prof.iyer@college.edu" },
      { code: "ME402", name: "Fluid Mechanics", teacherEmail: "prof.bhatt@college.edu" },
      { code: "ME403", name: "Machine Design", teacherEmail: "prof.chauhan@college.edu" },
      { code: "ME404", name: "Manufacturing Processes", teacherEmail: "prof.bhatt@college.edu" },
      { code: "ME405", name: "Heat Transfer", teacherEmail: "prof.iyer@college.edu" },
    ],
    classes: [{ division: "A", rollStart: 1, students: 7, pending: 1 }],
  },
];

// 38 distinct first names, consumed in order across all classes.
const STUDENT_NAMES = [
  "Vihaan Kapoor", "Ananya Reddy", "Arjun Nambiar", "Ishita Banerjee", "Kabir Saxena", "Meera Pillai",
  "Rohan Deshmukh", "Saanvi Choudhury", "Aditya Menon", "Navya Agarwal", "Reyansh Bose", "Kiara Thakur",
  "Yash Trivedi", "Tara Mishra", "Dev Ahuja", "Riya Kulshreshtha", "Karthik Subramanian", "Pranavi Rao",
  "Harsh Vardhan", "Aisha Khan", "Siddharth Jain", "Myra Dutta", "Neil Fernandes", "Zoya Ansari",
  "Aman Tiwari", "Jiya Bhatia", "Rudra Pandey", "Sara D'Souza", "Ved Naik", "Anika Sethi",
  "Lakshya Oberoi", "Pari Goswami", "Ayaan Qureshi", "Trisha Mukherjee", "Veer Rathore", "Ira Kohli",
  "Shaurya Lal", "Navika Sood",
];

async function main() {
  console.log("🌱 Seeding extra demo data...");
  const passwordHash = await bcrypt.hash("Password@123", 10);

  const academicYear = await prisma.academicYear.findUnique({ where: { label: "2025-2026" } });
  if (!academicYear) throw new Error('Academic year "2025-2026" not found. Run `prisma:seed` first.');

  // Teachers
  const teacherIds = new Map<string, string>();
  for (const [email, name] of Object.entries(TEACHERS)) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { name, email, passwordHash, role: Role.TEACHER, status: UserStatus.ACTIVE },
    });
    teacherIds.set(email, user.id);
  }

  let nameIdx = 0;
  const counts = { classes: 0, subjects: 0, assignments: 0, slots: 0, students: 0 };

  for (const spec of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { code: spec.code },
      update: {},
      create: { code: spec.code, name: spec.name, active: true },
    });

    const subjects = [];
    for (const s of spec.subjects) {
      subjects.push(
        await prisma.subject.upsert({
          where: { departmentId_code: { departmentId: dept.id, code: s.code } },
          update: {},
          create: { code: s.code, name: s.name, departmentId: dept.id, active: true },
        }),
      );
      counts.subjects++;
    }

    for (const [classIdx, c] of spec.classes.entries()) {
      const cls = await prisma.class.upsert({
        where: {
          departmentId_academicYearId_semesterNumber_division: {
            departmentId: dept.id,
            academicYearId: academicYear.id,
            semesterNumber: SEMESTER,
            division: c.division,
          },
        },
        update: {},
        create: {
          departmentId: dept.id,
          academicYearId: academicYear.id,
          semesterNumber: SEMESTER,
          division: c.division,
          label: `${spec.code}-Sem${SEMESTER}-${c.division}`,
          active: true,
        },
      });
      counts.classes++;

      // Teacher assignments: one per (class, subject). Existing ones are left as they are.
      const assignments = [];
      for (const [i, s] of spec.subjects.entries()) {
        assignments.push(
          await prisma.teacherAssignment.upsert({
            where: { classId_subjectId: { classId: cls.id, subjectId: subjects[i].id } },
            update: {},
            create: {
              classId: cls.id,
              subjectId: subjects[i].id,
              teacherUserId: teacherIds.get(s.teacherEmail)!,
              active: true,
            },
          }),
        );
        counts.assignments++;
      }

      // Weekly timetable: Mon-Fri x 3 periods = 15 slots, 3 per subject. Latin-square layout, with each
      // later division of a department shifted by one subject so a shared teacher never double-books.
      const shift = classIdx;
      for (let day = 1; day <= 5; day++) {
        for (const [p, [start, end]] of PERIODS.entries()) {
          const idx = (day - 1 + p + shift) % spec.subjects.length;
          const exists = await prisma.timetableEntry.findFirst({
            where: { classId: cls.id, dayOfWeek: day, startTime: start },
          });
          if (exists) continue;
          await prisma.timetableEntry.create({
            data: {
              classId: cls.id,
              subjectId: subjects[idx].id,
              teacherAssignmentId: assignments[idx].id,
              dayOfWeek: day,
              startTime: start,
              endTime: end,
              room: `${spec.code}-${c.division}-${100 + day * 10 + p}`,
            },
          });
          counts.slots++;
        }
      }

      // Students: ACTIVE ones get a login; PENDING ones await admin approval.
      const total = c.students + c.pending;
      for (let n = 0; n < total; n++) {
        const fullName = STUDENT_NAMES[nameIdx++];
        if (!fullName) throw new Error("Ran out of student names");
        const first = fullName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "");
        const email = `student.${first}@college.edu`;
        const rollNumber = `${spec.rollPrefix}${String(c.rollStart + n).padStart(3, "0")}`;
        const pending = n >= c.students;

        const user = pending
          ? null
          : await prisma.user.upsert({
              where: { email },
              update: {},
              create: { name: fullName, email, passwordHash, role: Role.STUDENT, status: UserStatus.ACTIVE },
            });

        await prisma.student.upsert({
          where: { email },
          update: {},
          create: {
            userId: user?.id,
            rollNumber,
            name: fullName,
            email,
            departmentId: dept.id,
            academicYearId: academicYear.id,
            classId: cls.id,
            status: pending ? StudentStatus.PENDING : StudentStatus.ACTIVE,
          },
        });
        counts.students++;
      }
    }
  }

  console.log("✅ Done:", counts, "(counts include rows that already existed)");
}

main()
  .catch((e) => {
    console.error("❌ Demo seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
