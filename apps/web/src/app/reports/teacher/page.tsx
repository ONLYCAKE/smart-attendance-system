"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/context/AuthContext";
import { TeacherReportView } from "@/features/reports";
import { GraduationCap, RefreshCw } from "lucide-react";
import { ThemeToggle } from "@/features/theme";

export default function TeacherReportsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center transition-colors duration-200">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 dark:text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 backdrop-blur sticky top-0 z-50 transition-colors duration-200">
        <div className="container max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-white transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                <GraduationCap className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm">Teacher Attendance Reports</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/sessions"
              className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
            >
              Sessions
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 container max-w-7xl mx-auto px-4 py-6">
        <TeacherReportView />
      </main>
    </div>
  );
}
