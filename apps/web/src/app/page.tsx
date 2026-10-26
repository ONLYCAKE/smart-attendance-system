import Link from "next/link";
import { 
  Users, 
  GraduationCap, 
  CalendarCheck2, 
  ScanFace, 
  BarChart3, 
  ShieldCheck,
  Building2
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-base tracking-tight">Smart Attendance</span>
              <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">College Management System</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-xs font-medium px-3.5 py-1.5 rounded-md border border-input hover:bg-accent transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-medium px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              Student Registration
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hero & Portals */}
      <main className="flex-1 container max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Welcome Banner */}
        <section className="rounded-xl border border-border bg-gradient-to-br from-card to-secondary/30 p-6 md:p-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Face-Recognition Assisted Attendance System
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Academic Attendance & Lecture Session Platform
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
            Streamlined lecture-based attendance recording, consent-based biometric face enrollment, 
            teacher-supervised recognition, and institutional percentage analytics.
          </p>
        </section>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2.5 shadow-sm">
            <div className="h-9 w-9 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm">Academic Hierarchy</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configurable Departments, Academic Years, Semesters, Divisions, Subjects, and Timetables.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-2.5 shadow-sm">
            <div className="h-9 w-9 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ScanFace className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm">Consent-Based Biometrics</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strict privacy: no raw photos stored. Face embeddings stored with audit logs and deletion workflows.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-2.5 shadow-sm">
            <div className="h-9 w-9 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm">Lecture Sessions</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Attendance tracked per lecture session with unique database constraints to prevent duplicate entries.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-2.5 shadow-sm">
            <div className="h-9 w-9 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm">Automated Alerts & Reports</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configurable 75% low-attendance threshold alerts, subject-wise analytics, and CSV exports.
            </p>
          </div>
        </div>

        {/* Role Access Portals */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">Role Dashboards</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Admin */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Administrator</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Institution-wide control: academic structure, student approvals, timetable scheduling, and audit logs.
                </p>
              </div>
              <Link
                href="/admin"
                className="text-xs font-medium text-center py-2 px-3 rounded-md border border-input hover:bg-accent transition-colors"
              >
                Access Admin Portal
              </Link>
            </div>

            {/* Teacher */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-sm">Teacher</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start lecture sessions, conduct camera-assisted face scanning, review matches, and correct attendance.
                </p>
              </div>
              <Link
                href="/teacher"
                className="text-xs font-medium text-center py-2 px-3 rounded-md border border-input hover:bg-accent transition-colors"
              >
                Access Teacher Portal
              </Link>
            </div>

            {/* Student */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-sm">Student</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  View personal attendance records, subject-wise percentages, low-attendance alerts, and face enrollment.
                </p>
              </div>
              <Link
                href="/student"
                className="text-xs font-medium text-center py-2 px-3 rounded-md border border-input hover:bg-accent transition-colors"
              >
                Access Student Portal
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <p>Smart Attendance Management System &bull; Version 1.0 Baseline</p>
      </footer>
    </div>
  );
}
