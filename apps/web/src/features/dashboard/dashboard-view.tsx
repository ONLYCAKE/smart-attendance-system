"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  BookOpen,
  Percent,
  Building2,
  Users,
  Layers,
  Bell,
  ChevronRight,
  ScanFace,
} from "lucide-react";
import { getDashboardMetricsApi } from "./api";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  DashboardData,
  StudentDashboardData,
  TeacherDashboardData,
  AdminDashboardData,
} from "./types";

// Custom chart tooltip adaptable to light and dark themes
function CustomChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs space-y-1">
        <p className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1">
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}:
            </span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
              {entry.value !== null && entry.value !== undefined
                ? typeof entry.value === "number" && entry.name.toLowerCase().includes("percentage")
                  ? `${entry.value}%`
                  : entry.value
                : "—"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);

  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDashboardMetricsApi({ days });
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load dashboard metrics"
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Timeframe Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Analytics & Attendance Performance Dashboard
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data?.role === "STUDENT" && "Personal lecture participation rates and subject progress"}
              {data?.role === "TEACHER" && "Supervised class cohorts, attendance volume, and at-risk students"}
              {data?.role === "ADMIN" && "Institution-wide attendance distribution, compliance trends, and departmental KPIs"}
              {!data && "Real-time attendance visualizations and KPI analytics"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Timeframe Select */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
            {[14, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  days === d
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            onClick={loadMetrics}
            disabled={loading}
            className="h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. STUDENT DASHBOARD */}
      {data?.role === "STUDENT" && (
        <StudentDashboardContent data={data as StudentDashboardData} />
      )}

      {/* 2. TEACHER DASHBOARD */}
      {data?.role === "TEACHER" && (
        <TeacherDashboardContent data={data as TeacherDashboardData} />
      )}

      {/* 3. ADMIN DASHBOARD */}
      {data?.role === "ADMIN" && (
        <AdminDashboardContent data={data as AdminDashboardData} />
      )}
    </div>
  );
}

// Student View Section
function StudentDashboardContent({
  data,
}: {
  data: StudentDashboardData;
}) {
  const { user } = useAuth();
  const isEnrolled =
    data.isFaceEnrolled ??
    Boolean(user?.studentProfile?.faceEnrollment && user.studentProfile.faceEnrollment.status === "ACTIVE");

  const kpis = data.kpis;
  const trend = data.trend;
  const subjects = data.subjectBreakdown;

  // Chart data for subjects
  const subjectChartData = subjects.map((s) => ({
    name: s.code,
    fullName: s.name,
    percentage: s.percentage ?? 0,
    attended: s.attended,
    total: s.total,
  }));

  return (
    <div className="space-y-6">
      {/* Face Biometric Enrollment Card */}
      <div
        className={`border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
          isEnrolled
            ? "bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30 dark:border-emerald-500/20"
            : "bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border-indigo-500/20"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              isEnrolled
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
            }`}
          >
            {isEnrolled ? <CheckCircle2 className="w-5 h-5" /> : <ScanFace className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Biometric Status
              {isEnrolled ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Enrolled & Active
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Pending Faculty Registration
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              {isEnrolled
                ? "Your facial biometrics are enrolled and active. During live lecture sessions, your faculty teacher will verify attendance."
                : "Your facial biometrics have not been registered yet. Initial biometric enrollment must be completed in-person by your faculty teacher or administrator."}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Overall Attendance</p>
            <div className="text-xl font-bold">
              {kpis.overallAttendancePercentage !== null ? (
                <span className={kpis.overallAttendancePercentage >= 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {kpis.overallAttendancePercentage}%
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">No sessions</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Min. Target: 75.0%</p>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              kpis.overallAttendancePercentage !== null && kpis.overallAttendancePercentage >= 75
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            <Percent className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sessions Held</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalEligibleSessions}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Excludes cancelled</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sessions Attended</p>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{kpis.attendedSessions}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">PRESENT + LATE</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Eligibility Status</p>
            <div className="text-sm font-semibold">
              {kpis.standing === "GOOD_STANDING" && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Good Standing
                </span>
              )}
              {kpis.standing === "BELOW_THRESHOLD" && (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Below 75%
                </span>
              )}
              {kpis.standing === "NO_SESSIONS" && (
                <span className="text-slate-400 dark:text-slate-500">No sessions held</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Institution policy</p>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              kpis.standing === "GOOD_STANDING"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Low Attendance Warning Alert Banner */}
      {kpis.standing === "BELOW_THRESHOLD" && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                Low Attendance Alert — Action Required
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-200/80">
                Your current attendance ({kpis.overallAttendancePercentage}%) is below the institutional 75.0% threshold.
              </p>
            </div>
          </div>
          <Link
            href="/notifications"
            className="h-7 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0"
          >
            <Bell className="w-3.5 h-3.5" />
            View Alerts
          </Link>
        </div>
      )}

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Attendance Trend Line Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              Daily Attendance Trend (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Past {data.timeframeDays} days</span>
          </div>

          <div className="h-64 w-full">
            {trend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <Calendar className="w-6 h-6 mb-1 opacity-50" />
                No lecture sessions recorded in this timeframe.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "75%", fill: "#f59e0b", fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="attendancePercentage"
                    name="Attendance Percentage"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Subject Attendance Breakdown Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              Subject Attendance Distribution (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{subjects.length} Subjects</span>
          </div>

          <div className="h-64 w-full">
            {subjectChartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <BookOpen className="w-6 h-6 mb-1 opacity-50" />
                No subjects found for current cohort.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="percentage" name="Attendance Percentage" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Quick Timetable Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Weekly Academic Schedule & Room Allocations</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">View your cohort's lecture periods, lab slots, and assigned classrooms</p>
          </div>
        </div>
        <Link
          href="/timetable"
          className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm shrink-0 self-start sm:self-auto"
        >
          View Timetable <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Teacher View Section
function TeacherDashboardContent({
  data,
}: {
  data: TeacherDashboardData;
}) {
  const kpis = data.kpis;
  const trend = data.trend;
  const subjects = data.subjectBreakdown;

  const subjectChartData = subjects.map((s) => ({
    name: s.code,
    fullName: s.name,
    percentage: s.averagePercentage ?? 0,
    totalSessions: s.totalSessions,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Assigned Cohorts</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalAssignedClasses}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Active class assignments</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Enrolled</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalStudents}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Active students in cohorts</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Class Average</p>
            <div className="text-xl font-bold">
              {kpis.classAveragePercentage !== null ? (
                <span className={kpis.classAveragePercentage >= 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {kpis.classAveragePercentage}%
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">No sessions</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Target minimum: 75%</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Percent className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">At-Risk (&lt; 75%)</p>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{kpis.belowThresholdCount}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Need academic alert</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              Daily Class Attendance (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Past {data.timeframeDays} days</span>
          </div>

          <div className="h-64 w-full">
            {trend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <Calendar className="w-6 h-6 mb-1 opacity-50" />
                No lecture sessions recorded in this timeframe.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="attendancePercentage"
                    name="Attendance Percentage"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: "#3b82f6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Subject Breakdown Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              Subject Average Performance (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{subjects.length} Subjects</span>
          </div>

          <div className="h-64 w-full">
            {subjectChartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <BookOpen className="w-6 h-6 mb-1 opacity-50" />
                No subject metrics available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="percentage" name="Average Percentage" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Quick Timetable Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Teaching Timetable & Period Schedules</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">View weekly lecture hours, assigned divisions, and assigned classrooms</p>
          </div>
        </div>
        <Link
          href="/timetable"
          className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm shrink-0 self-start sm:self-auto"
        >
          View Schedule <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// Admin View Section
function AdminDashboardContent({
  data,
}: {
  data: AdminDashboardData;
}) {
  const kpis = data.kpis;
  const trend = data.trend;
  const departments = data.departmentBreakdown;

  const deptChartData = departments.map((d) => ({
    name: d.code,
    fullName: d.name,
    percentage: d.averagePercentage ?? 0,
    students: d.studentCount,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Departments</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalDepartments}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Active units</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Classes</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalClasses}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Divisions</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Students</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalActiveStudents}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Active roster</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sessions</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{kpis.totalSessionsHeld}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Held in period</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Institute Avg</p>
            <div className="text-xl font-bold">
              {kpis.overallAverageAttendance !== null ? (
                <span className={kpis.overallAverageAttendance >= 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {kpis.overallAverageAttendance}%
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">No sessions</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Target: 75%</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Percent className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">At-Risk (&lt; 75%)</p>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{kpis.totalAtRiskStudents}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Institution-wide</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              Institutional Attendance Trend (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Past {data.timeframeDays} days</span>
          </div>

          <div className="h-64 w-full">
            {trend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <Calendar className="w-6 h-6 mb-1 opacity-50" />
                No lecture sessions recorded in this timeframe.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="averagePercentage"
                    name="Average Percentage"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: "#6366f1", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Department Breakdown Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              Department Attendance Distribution (%)
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{departments.length} Units</span>
          </div>

          <div className="h-64 w-full">
            {deptChartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                <Building2 className="w-6 h-6 mb-1 opacity-50" />
                No department records available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={10} tickLine={false} unit="%" />
                  <Tooltip content={<CustomChartTooltip />} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Bar dataKey="percentage" name="Average Percentage" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
