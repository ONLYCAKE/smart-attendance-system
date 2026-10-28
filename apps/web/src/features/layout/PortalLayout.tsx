"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ThemeToggle } from "@/features/theme";
import {
  ScanFace,
  LayoutDashboard,
  Calendar,
  Clock,
  BarChart3,
  Bell,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  RefreshCw,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export function PortalLayout({
  children,
  pageTitle,
  pageSubtitle,
}: {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          <span>Loading portal session...</span>
        </div>
      </div>
    );
  }

  const role = user.role;

  // Role-specific navigation items
  const navItems: NavItem[] =
    role === "TEACHER"
      ? [
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: "Course Timetable", href: "/timetable", icon: Calendar },
          { label: "Attendance Sessions", href: "/sessions", icon: Clock },
          { label: "Student Biometrics", href: "/enrollment", icon: ScanFace },
          { label: "Reports & Analytics", href: "/reports", icon: BarChart3 },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ]
      : role === "STUDENT"
      ? [
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { label: "My Timetable", href: "/timetable", icon: Calendar },
          { label: "Attendance Reports", href: "/reports", icon: BarChart3 },
          { label: "Notifications", href: "/notifications", icon: Bell },
        ]
      : [
          // Admin quick access
          { label: "Admin Console", href: "/admin", icon: ShieldCheck },
          { label: "Dashboard Overview", href: "/dashboard", icon: LayoutDashboard },
          { label: "Institution Timetable", href: "/timetable", icon: Calendar },
          { label: "Lecture Sessions", href: "/sessions", icon: Clock },
          { label: "Attendance Reports", href: "/reports", icon: BarChart3 },
          { label: "Biometric Enrollment", href: "/admin/enrollment", icon: ScanFace },
          { label: "System Notifications", href: "/notifications", icon: Bell },
        ];

  const roleBadgeColor =
    role === "ADMIN"
      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
      : role === "TEACHER"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";

  const renderNavLinks = () => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-accent text-foreground">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-foreground transition-colors duration-200">
      {/* Desktop Persistent Sidebar */}
      <aside className="w-64 border-r border-border bg-card shrink-0 hidden md:flex flex-col justify-between">
        <div className="p-4 space-y-6">
          {/* Brand & Role Header */}
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                <ScanFace className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-foreground block leading-tight">
                  Smart Attendance
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Campus Platform
                </span>
              </div>
            </Link>
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${roleBadgeColor}`}
            >
              {role}
            </span>
          </div>

          {/* Navigation Links */}
          {renderNavLinks()}
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
                title="Sign out of your account"
                className="h-7 px-2 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center gap-1 text-muted-foreground text-xs font-medium transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer (Overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-[80%] bg-card border-r border-border flex flex-col justify-between p-4 z-10 shadow-xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
                    <ScanFace className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-foreground block leading-tight">
                      Smart Attendance
                    </span>
                    <span className="text-[10px] text-muted-foreground">{role} Portal</span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {renderNavLinks()}
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <div className="text-xs">
                <p className="font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <ThemeToggle />
                <button
                  onClick={() => logout()}
                  className="h-7 px-2.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Top Header */}
        <header className="md:hidden border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40 px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-muted text-foreground"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <ScanFace className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">Smart Attendance</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${roleBadgeColor}`}
            >
              {role}
            </span>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {pageTitle && (
            <div className="flex flex-col gap-1 pb-2 border-b border-border/60">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                {pageTitle}
              </h1>
              {pageSubtitle && (
                <p className="text-xs md:text-sm text-muted-foreground">{pageSubtitle}</p>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
