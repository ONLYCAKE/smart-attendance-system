import Link from "next/link";
import { ThemeToggle } from "@/features/theme";
import {
  Users,
  GraduationCap,
  CalendarCheck2,
  ScanFace,
  BarChart3,
  ShieldCheck,
  Building2,
  Lock,
  ArrowRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* Top Header — Clean & Unauthenticated (Only Brand, Sign In, & ThemeToggle) */}
      <header className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-50 transition-colors duration-200">
        <div className="container max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-base tracking-tight text-foreground">
                Smart Attendance
              </span>
              <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">
                College Management System
              </span>
            </div>
          </div>

          {/* Only Sign In button & Theme Toggle as required */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hero & Features */}
      <main className="flex-1 container max-w-7xl mx-auto px-4 py-10 space-y-10">
        {/* Welcome Banner */}
        <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-6 md:p-10 space-y-4 shadow-sm">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            Enterprise Biometric Attendance Infrastructure
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-foreground max-w-3xl leading-tight">
            Academic Attendance & Lecture Session Platform
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
            Streamlined lecture-based attendance recording, consent-based biometric face enrollment, 
            teacher-supervised recognition, and institutional percentage analytics.
          </p>
          <div className="pt-2 flex items-center gap-3 flex-wrap">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-sm transition-all"
            >
              <span>Access Your Portal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">Academic Hierarchy</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configurable Departments, Academic Years, Semesters, Divisions, Subjects, and Timetables.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ScanFace className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">Consent-Based Biometrics</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Strict privacy: no raw photos stored. Face embeddings stored with audit logs and deletion workflows.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">Lecture Sessions</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Attendance tracked per lecture session with unique database constraints to prevent duplicate entries.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-xs">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">Automated Alerts & Reports</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configurable 75% low-attendance threshold alerts, subject-wise analytics, and history logs.
            </p>
          </div>
        </div>

        {/* Institutional Stakeholder Ecosystem Overview */}
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              Institutional Role-Based Architecture
            </h2>
            <p className="text-xs text-muted-foreground">
              Role permissions are verified dynamically upon login to ensure secure, isolated access.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>Administration</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Institution-wide academic structure, faculty assignments, master timetable schedules, and system audit logs.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                <GraduationCap className="w-4 h-4" />
                <span>Faculty & Instructors</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Start live lecture sessions, conduct camera-assisted face scanning, review match confidence, and submit attendance.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                <Users className="w-4 h-4" />
                <span>Students</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Personal attendance percentages, low-attendance warnings, weekly lecture schedules, and biometric consent enrollment.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground bg-card/30">
        <p>Smart Attendance Management System &bull; Version 1.0 Baseline</p>
      </footer>
    </div>
  );
}
