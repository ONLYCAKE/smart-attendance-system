"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Calendar,
  AlertTriangle,
  Percent,
  Search,
  X,
  RefreshCw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Download,
} from "lucide-react";
import {
  getTeacherAttendanceReportApi,
  getMyTeacherAssignmentsApi,
  getAllClassesApi,
  getTeacherReportExportUrl,
  downloadReportCsv,
} from "./api";
import { TeacherReportData } from "./types";
import { useAuth } from "../auth/context/AuthContext";

export function TeacherReportView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Classes available to teacher / admin
  const [availableClasses, setAvailableClasses] = useState<
    Array<{ classId: string; classLabel: string; subjectId?: string; subjectName?: string; subjectCode?: string }>
  >([]);
  const [classesLoading, setClassesLoading] = useState(true);

  // Selected filters
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Search input (immediate) and search term (debounced)
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldMaintainFocus = useRef<boolean>(false);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);

  // Report Data
  const [data, setData] = useState<TeacherReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Load Available Classes on mount
  useEffect(() => {
    let isMounted = true;
    async function loadClasses() {
      try {
        setClassesLoading(true);
        if (isAdmin) {
          const allClasses = await getAllClassesApi();
          if (isMounted) {
            const mapped = allClasses.map((c) => ({
              classId: c.id,
              classLabel: c.label,
            }));
            setAvailableClasses(mapped);
            const firstMapped = mapped[0];
            if (firstMapped && !selectedClassId) {
              setSelectedClassId(firstMapped.classId);
            }
          }
        } else {
          const myAssignments = await getMyTeacherAssignmentsApi();
          if (isMounted) {
            setAvailableClasses(myAssignments);
            const firstAssigned = myAssignments[0];
            if (firstAssigned && !selectedClassId) {
              setSelectedClassId(firstAssigned.classId);
              if (firstAssigned.subjectId) {
                setSelectedSubjectId(firstAssigned.subjectId);
              }
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load assigned classes");
        }
      } finally {
        if (isMounted) setClassesLoading(false);
      }
    }
    loadClasses();
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  // 2. Debounce search input (400ms)
  useEffect(() => {
    if (searchInput === "") {
      setDebouncedSearch("");
      setPage(1);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // 3. Load Teacher Attendance Report
  const loadReport = useCallback(async () => {
    if (!selectedClassId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await getTeacherAttendanceReportApi({
        classId: selectedClassId,
        subjectId: selectedSubjectId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
        page,
        limit,
      });
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load attendance report"
      );
      setData(null);
    } finally {
      setLoading(false);
      if (shouldMaintainFocus.current && searchInputRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (searchInputRef.current && shouldMaintainFocus.current) {
              searchInputRef.current.focus();
              const len = searchInputRef.current.value.length;
              searchInputRef.current.setSelectionRange(len, len);
            }
          }, 0);
        });
      }
    }
  }, [selectedClassId, selectedSubjectId, dateFrom, dateTo, debouncedSearch, page, limit]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExport = async () => {
    if (!selectedClassId) return;
    try {
      setExporting(true);
      const url = getTeacherReportExportUrl({
        classId: selectedClassId,
        subjectId: selectedSubjectId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: debouncedSearch || undefined,
      });
      const classLabel = data?.class?.label || "class";
      await downloadReportCsv(url, `class-attendance-${classLabel}.csv`);
    } catch (err: any) {
      alert("Failed to export class attendance CSV: " + (err.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const metrics = data?.metrics;
  const students = data?.students || [];
  const pagination = data?.pagination;

  // Filter distinct classes for select
  const uniqueClasses = Array.from(
    new Map(availableClasses.map((item) => [item.classId, item])).values()
  );

  // Filter subjects for the selected class
  const classSubjects = availableClasses.filter(
    (item) => item.classId === selectedClassId && item.subjectId
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Class Attendance Analytics & Roster Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregate attendance metrics, low-threshold alerts, and student breakdown
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || loading || !selectedClassId}
            className="h-7 px-2.5 text-xs inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? "animate-spin" : ""}`} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
          <button
            onClick={loadReport}
            disabled={loading || !selectedClassId}
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

      {/* Class Selector Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center gap-3 shadow-sm transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Select Cohort:</span>
          {classesLoading ? (
            <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedSubjectId("");
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
            >
              {uniqueClasses.length === 0 ? (
                <option value="">No authorized classes found</option>
              ) : (
                uniqueClasses.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.classLabel}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        {/* Optional Subject Filter (if teacher has specific subject assignments) */}
        {classSubjects.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Subject:</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Assigned Subjects</option>
              {classSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectCode} - {s.subjectName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date Filter */}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400">Date:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="h-7 px-2 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            title="Start Date"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="h-7 px-2 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            title="End Date"
          />
          {(dateFrom || dateTo || selectedSubjectId) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setSelectedSubjectId("");
                setPage(1);
              }}
              className="h-7 px-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Aggregate KPI Stats Cards (Compact 4-grid) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Students */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Enrolled Students</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                metrics?.totalStudents ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Active class roster</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Sessions Held */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sessions Held</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                metrics?.totalSessionsHeld ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Excludes cancelled</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        {/* Class Average % */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Class Average</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : metrics?.classAveragePercentage !== null && metrics?.classAveragePercentage !== undefined ? (
                <span
                  className={
                    metrics.classAveragePercentage >= 75
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {metrics.classAveragePercentage}%
                </span>
              ) : (
                <span className="text-xs text-slate-400 font-normal">No sessions</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Min target: 75%</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Percent className="w-4 h-4" />
          </div>
        </div>

        {/* Below Threshold Alert */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">At-Risk (&lt; 75%)</p>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {loading && !data ? (
                <div className="h-6 w-10 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                metrics?.belowThresholdCount ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Require intervention</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Student Roster Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm transition-colors">
        {/* Header & Debounced Search Row */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between min-h-7 gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Student Attendance Breakdown
              </h2>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {students.length} of {pagination?.total ?? 0} students
            </div>
          </div>

          {/* Search Input with Focus Maintenance */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by student name or roll number..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => {
                  shouldMaintainFocus.current = true;
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setTimeout(() => {
                      if (document.activeElement !== searchInputRef.current) {
                        shouldMaintainFocus.current = false;
                      }
                    }, 100);
                  }
                }}
                className="h-7 px-2.5 pl-8 pr-7 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 w-64"
                autoComplete="off"
              />
              {searchInput && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Compact Table */}
        <div className="table-compact transition-opacity duration-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-normal text-slate-600 dark:text-slate-400">
                <th className="px-3 py-2">Roll Number</th>
                <th className="px-3 py-2">Student Name</th>
                <th className="px-3 py-2 text-center">Present</th>
                <th className="px-3 py-2 text-center">Late</th>
                <th className="px-3 py-2 text-center">Absent</th>
                <th className="px-3 py-2 text-center">Excused</th>
                <th className="px-3 py-2 text-center">Attended / Held</th>
                <th className="px-3 py-2 text-right">Attendance %</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/60 min-h-[150px]">
              {loading && students.length === 0 ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skel-row-${idx}`} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-14 mx-auto" /></td>
                    <td className="px-3 py-2.5 text-right"><div className="h-4 bg-slate-800 rounded w-12 ml-auto" /></td>
                    <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    <Users className="w-6 h-6 mx-auto mb-1 text-slate-500 opacity-60" />
                    <p className="text-xs font-medium">No student records found</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {debouncedSearch
                        ? `No students matching "${debouncedSearch}"`
                        : "No active students enrolled in this cohort"}
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((st: any) => {
                  const sObj = st.student || {};
                  const studentId = st.studentId || sObj.id || st.id;
                  const rollNumber = st.rollNumber || sObj.rollNumber || "—";
                  const studentName = st.name || (sObj.user ? `${sObj.user.firstName || ""} ${sObj.user.lastName || ""}`.trim() : sObj.name) || "Student";
                  const studentEmail = st.email || sObj.user?.email || "";
                  const totalSessions = st.totalEligibleSessions ?? st.totalSessions ?? 0;
                  const attendedSessions = st.attendedSessions ?? st.attendedCount ?? 0;
                  const hasSessions = totalSessions > 0;
                  const pct = st.percentage;

                  return (
                    <tr
                      key={studentId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {rollNumber}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-slate-200">
                        <div className="font-medium">{studentName}</div>
                        {studentEmail && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{studentEmail}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-emerald-600 dark:text-emerald-400 font-medium">
                        {st.presentCount}
                      </td>
                      <td className="px-3 py-2 text-center text-amber-600 dark:text-amber-400 font-medium">
                        {st.lateCount}
                      </td>
                      <td className="px-3 py-2 text-center text-red-600 dark:text-red-400 font-medium">
                        {st.absentCount}
                      </td>
                      <td className="px-3 py-2 text-center text-blue-600 dark:text-blue-400 font-medium">
                        {st.excusedCount}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300 font-mono">
                        {attendedSessions} / {totalSessions}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {hasSessions && pct !== null ? (
                          <span
                            className={`font-semibold ${
                              pct >= 75 ? "text-emerald-400" : "text-amber-400"
                            }`}
                          >
                            {pct}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            No sessions held
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {hasSessions && pct !== null ? (
                          pct >= 75 ? (
                            <span className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Eligible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" /> Low
                            </span>
                          )
                        ) : (
                          <span className="h-6 px-2 text-[11px] text-slate-500 dark:text-slate-400 rounded bg-slate-800/80 inline-flex items-center">
                            N/A
                          </span>
                        )}
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
          <div className="flex flex-wrap justify-between items-center gap-2.5 border-t border-slate-800 px-4 py-2.5 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 px-2 text-xs rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} students)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
