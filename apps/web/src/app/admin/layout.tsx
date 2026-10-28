"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ThemeToggle } from "@/features/theme";
import {
  ScanFace,
  LayoutDashboard,
  Building2,
  GraduationCap,
  BookOpen,
  Calendar,
  Users,
  Clock,
  LogOut,
  Loader2,
  UserCheck,
  Settings2,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Departments", href: "/admin/departments", icon: Building2 },
  { label: "Classes & Cohorts", href: "/admin/classes", icon: GraduationCap },
  { label: "Subjects", href: "/admin/subjects", icon: BookOpen },
  { label: "Faculty Assignments", href: "/admin/teacher-assignments", icon: UserCheck },
  { label: "Timetable", href: "/admin/timetable", icon: Calendar },
  { label: "Students", href: "/admin/students", icon: Users },
  { label: "Settings", href: "/admin/settings", icon: Settings2 },
  { label: "Face Enrollment", href: "/admin/enrollment", icon: ScanFace },
  { label: "Attendance Sessions", href: "/sessions", icon: Clock },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span>Verifying administrator permissions...</span>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card shrink-0 flex flex-col justify-between">
        <div className="p-4 space-y-6">
          {/* Logo & Role Badge */}
          <div className="flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                <ScanFace className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">
                Smart Attendance
              </span>
            </Link>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              Admin
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card, Theme Toggle & Logout */}
        <div className="p-3 border-t border-border bg-card/50">
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle />
              <button
                onClick={() => logout()}
                title="Sign out"
                className="h-7 px-2 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center gap-1 text-muted-foreground text-xs font-medium transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
