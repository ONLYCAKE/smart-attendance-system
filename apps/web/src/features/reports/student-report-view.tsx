"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  BookOpen,
  GraduationCap,
  Percent,
  XCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { getStudentReportApi, getStudentReportExportUrl, downloadReportCsv } from "./api";
import { StudentReportData } from "./types";

export function StudentReportView() {
  const [data, setData] = useState<StudentReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [subjectId, setSubjectId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);

  const handleExport = async () => {
    try {
      setExporting(true);
      const url = getStudentReportExportUrl({
        subjectId: subjectId || undefined,
        status: (status as any) || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      await downloadReportCsv(url, `student-attendance-${data?.student?.rollNumber || "me"}.csv`);
    } catch (err: any) {
      alert("Failed to export attendance CSV: " + (err.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getStudentReportApi({
        subjectId: subjectId || undefined,
        status: (status as any) || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit,
      });
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load attendance history"
      );
    } finally {
      setLoading(false);
    }
  }, [subjectId, status, dateFrom, dateTo, page, limit]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleResetFilters = () => {
    setSubjectId("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const summary = data?.summary;
  const history = data?.history || [];
  const pagination = data?.pagination;
  const subjectBreakdown = data?.subjects || summary?.subjectBreakdown || [];

  return (
    <div className="space-y-6">
      {/* Page Title & Profile Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Personal Attendance Report & History
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data?.student?.name ? (
                <span>
                  {data.student.name} &bull; Roll: {data.student.rollNumber} &bull; Class: {data.student.classLabel || (data.student as any)?.class?.label || "Enrolled Cohort"} ({(data.student as any)?.class?.department?.name || data.student.departmentName || "Academic"})
                </span>
              ) : (
                "Verified student attendance records & institutional percentages"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            onClick={loadReport}
            disabled={loading}
            className="h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Overall Percentage */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Overall Attendance</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : summary?.overallPercentage !== null && summary?.overallPercentage !== undefined ? (
                <span
                  className={
                    summary.overallPercentage >= 75
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {summary.overallPercentage}%
                </span>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                  No sessions held
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Min. Required: 75.0%
            </p>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              summary?.overallPercentage !== null && summary?.overallPercentage !== undefined && summary.overallPercentage >= 75
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            <Percent className="w-4 h-4" />
          </div>
        </div>

        {/* Total Sessions Held */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Sessions Held</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.totalEligibleSessions ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Excludes cancelled lectures</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        {/* Attended Sessions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Attended Sessions</p>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.attendedSessions ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">PRESENT + LATE</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Attendance Status Warning */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Threshold Status</p>
            <div className="text-sm font-semibold">
              {loading && !data ? (
                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : summary?.overallPercentage === null ? (
                <span className="text-slate-400 dark:text-slate-500">No sessions</span>
              ) : summary?.overallPercentage! >= 75 ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Good Standing
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Low Attendance
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Institute threshold: 75%</p>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              summary?.overallPercentage !== null && summary?.overallPercentage !== undefined && summary.overallPercentage >= 75
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Subject-Wise Attendance Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            Subject-Wise Attendance Breakdown
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {subjectBreakdown.length} Subjects
          </span>
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 animate-pulse space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded w-full" />
              </div>
            ))}
          </div>
        ) : subjectBreakdown.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No subjects or sessions found for your enrolled class.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjectBreakdown.map((subj: any) => {
              const isEligible = subj.totalEligibleSessions > 0;
              const pct = subj.percentage;
              const isLow = isEligible && pct !== null && pct < 75;

              return (
                <div
                  key={subj.subjectId}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-xl p-3.5 space-y-2.5 transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                          {subj.code}
                        </span>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            <AlertTriangle className="w-2.5 h-2.5" /> Below 75%
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate mt-1">
                        {subj.name}
                      </h3>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {isEligible && pct !== null ? (
                        <div
                          className={`text-base font-bold ${
                            pct >= 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {pct}%
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                          No sessions held
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          pct === null
                            ? "bg-transparent"
                            : pct >= 75
                            ? "bg-emerald-500"
                            : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Attended: {subj.attendedSessions ?? subj.attendedCount ?? 0}</span>
                      <span>Total Held: {subj.totalEligibleSessions}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attendance History Card & Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Header & Filter Controls (Two-Row Pattern) */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between min-h-7 gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Attendance Log & History</h2>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {history.length} of {pagination?.total ?? 0} records
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Subject Filter */}
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="">All Subjects</option>
              {subjectBreakdown.map((s: any) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="">All Statuses</option>
              <option value="PRESENT">PRESENT</option>
              <option value="LATE">LATE</option>
              <option value="ABSENT">ABSENT</option>
              <option value="EXCUSED">EXCUSED</option>
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-7 px-2 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 shadow-sm"
                title="From Date"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-7 px-2 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 shadow-sm"
                title="To Date"
              />
            </div>

            {(subjectId || status || dateFrom || dateTo) && (
              <button
                onClick={handleResetFilters}
                className="h-7 px-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="table-compact transition-opacity duration-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-normal text-slate-600 dark:text-slate-400">
                <th className="px-3 py-2">Session Date & Time</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Attendance Status</th>
                <th className="px-3 py-2">Verification Method</th>
                <th className="px-3 py-2">Verified At</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/60 min-h-[150px]">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-24" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-36" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-28" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-20" /></td>
                  </tr>
                ))
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <Clock className="w-6 h-6 mx-auto mb-1 text-slate-400 dark:text-slate-500 opacity-60" />
                    <p className="text-xs font-medium">No attendance records found</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {subjectId || status || dateFrom || dateTo
                        ? "Try adjusting your active filters"
                        : "No recorded lecture attendance sessions for your class"}
                    </p>
                  </td>
                </tr>
              ) : (
                history.map((rec) => {
                  const isPresent = rec.status === "PRESENT";
                  const isLate = rec.status === "LATE";
                  const isAbsent = rec.status === "ABSENT";
                  const isExcused = rec.status === "EXCUSED";

                  const rawDate = rec.session?.startsAt || rec.date || rec.markedAt;
                  const formattedDate = rawDate
                    ? new Date(rawDate).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "—";
                  const formattedTime = rawDate
                    ? new Date(rawDate).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";

                  const subjectName = rec.session?.subject?.name || rec.subject?.name || "Lecture Session";
                  const subjectCode = rec.session?.subject?.code || rec.subject?.code || "—";
                  const keyId = rec.id || rec.recordId || `${rec.sessionId}-${rawDate}`;

                  return (
                    <tr
                      key={keyId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                        <div className="font-medium">{formattedDate}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{formattedTime}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{subjectName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{subjectCode}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 h-6 px-2 text-xs font-medium rounded-full border ${
                            isPresent
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : isLate
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              : isAbsent
                              ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          }`}
                        >
                          {isPresent && <CheckCircle2 className="w-3 h-3" />}
                          {isLate && <Clock className="w-3 h-3" />}
                          {isAbsent && <XCircle className="w-3 h-3" />}
                          {isExcused && <HelpCircle className="w-3 h-3" />}
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/50">
                          {rec.method}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {rec.verifiedAt || rec.markedAt
                          ? new Date(rec.verifiedAt || rec.markedAt!).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-wrap justify-between items-center gap-2.5 border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 px-2 text-xs rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
