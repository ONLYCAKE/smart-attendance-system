"use client";

import React, { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/context/AuthContext";
import { SessionDashboard } from "@/features/sessions";
import { ThemeToggle } from "@/features/theme";
import {
  CalendarCheck2,
  BarChart3,
  Calendar,
  RefreshCw,
  LogOut,
  ChevronLeft,
} from "lucide-react";

export default function SessionDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading, logout } = useAuth();
  const sessionId = params.id as string;

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user || !sessionId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60 backdrop-blur sticky top-0 z-50 transition-colors duration-200">
        <div className="container max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/sessions"
              className="flex items-center gap-2 text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-white transition-colors"
            >
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                <ChevronLeft className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm">Session Control</span>
            </Link>
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">&bull; Live Attendance Monitoring</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-400 hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              <span>{user.name}</span>
              <span className="text-slate-400 dark:text-slate-500 font-mono">({user.role})</span>
            </div>

            <Link
              href="/sessions"
              className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-sm"
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              All Sessions
            </Link>

            <Link
              href="/dashboard"
              className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-sm"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Dashboard
            </Link>

            <Link
              href="/timetable"
              className="text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              Timetable
            </Link>

            {/* Dark / Light Theme Toggle */}
            <ThemeToggle />

            {/* Logout Button */}
            <button
              onClick={() => logout()}
              title="Sign out of account"
              className="h-7 px-2.5 text-xs font-medium rounded-md border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 container max-w-7xl mx-auto px-4 py-6">
        <SessionDashboard sessionId={sessionId} />
      </main>
    </div>
  );
}
