"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Users,
  Calendar,
  Percent,
  RefreshCw,
  AlertTriangle,
  GraduationCap,
  Layers,
  Download,
} from "lucide-react";
import {
  getAdminSummaryApi,
  getAllDepartmentsApi,
  getAdminSummaryExportUrl,
  downloadReportCsv,
} from "./api";
import { AdminSummaryData } from "./types";

export function AdminSummaryView() {
  const [data, setData] = useState<AdminSummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Departments for filter
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");

  // Tab switch between Department Breakdown and Class Breakdown
  const [activeTab, setActiveTab] = useState<"departments" | "classes">("departments");

  // Load departments list on mount
  useEffect(() => {
    async function loadDepts() {
      try {
        const depts = await getAllDepartmentsApi();
        setDepartments(depts);
      } catch {
        // Ignored
      }
    }
    loadDepts();
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAdminSummaryApi({
        departmentId: selectedDeptId || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load institutional attendance summary"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDeptId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const url = getAdminSummaryExportUrl({
        departmentId: selectedDeptId || undefined,
      });
      await downloadReportCsv(url, "institution-attendance-summary.csv");
    } catch (err: any) {
      alert("Failed to export institution summary CSV: " + (err.message || "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const deptList = data?.departments || [];
  const classList = data?.classes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Institution-Wide Attendance Summary
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">
              Departmental aggregates, cohort distribution, and overall compliance metrics
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
            onClick={loadSummary}
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

      {/* Filter Row */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm flex-wrap transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-700 dark:text-slate-300">Department Scope:</span>
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="h-7 px-2.5 text-xs rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
          >
            <option value="">All Academic Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>
        </div>

        {selectedDeptId && (
          <button
            onClick={() => setSelectedDeptId("")}
            className="h-7 px-2 text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* KPI Stats Cards (5-grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Departments */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">Departments</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-10 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.totalDepartments ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Academic units</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        {/* Total Classes */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">Class Cohorts</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-10 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.totalClasses ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Active divisions</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Total Active Students */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">Active Students</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.totalActiveStudents ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Roster total</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Total Sessions Held */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">Sessions Held</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-12 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : (
                summary?.totalSessionsHeld ?? 0
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Completed + Active</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        {/* Institutional Average Attendance % */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-500 dark:text-slate-400">Institute Average</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {loading && !data ? (
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
              ) : summary?.overallAverageAttendance !== null && summary?.overallAverageAttendance !== undefined ? (
                <span
                  className={
                    summary.overallAverageAttendance >= 75
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {summary.overallAverageAttendance}%
                </span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">No sessions</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">Institution target: 75%</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Percent className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Breakdown Tables with Tab Selection */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm transition-colors">
        {/* Tab Headers */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-3 flex items-center gap-4">
          <button
            onClick={() => setActiveTab("departments")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "departments"
                ? "border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Department Breakdown ({deptList.length})
          </button>
          <button
            onClick={() => setActiveTab("classes")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "classes"
                ? "border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 dark:text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Class Cohort Breakdown ({classList.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "departments" ? (
          <div className="table-compact overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-normal text-slate-600 dark:text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Department Code</th>
                  <th className="px-3 py-2">Department Name</th>
                  <th className="px-3 py-2 text-center">Classes</th>
                  <th className="px-3 py-2 text-center">Students</th>
                  <th className="px-3 py-2 text-center">Sessions Held</th>
                  <th className="px-3 py-2 text-right">Average Attendance %</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/60 min-h-[150px]">
                {loading && deptList.length === 0 ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={`skel-dept-${idx}`} className="animate-pulse">
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-44" /></td>
                      <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                      <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-10 mx-auto" /></td>
                      <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-10 mx-auto" /></td>
                      <td className="px-3 py-2.5 text-right"><div className="h-4 bg-slate-800 rounded w-14 ml-auto" /></td>
                    </tr>
                  ))
                ) : deptList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No departments match current scope.
                    </td>
                  </tr>
                ) : (
                  deptList.map((dept) => {
                    const pct = dept.averageAttendancePercentage;
                    return (
                      <tr key={dept.departmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold text-blue-400">
                          {dept.code}
                        </td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-200 font-medium">
                          {dept.name}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">
                          {dept.classCount}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">
                          {dept.studentCount}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">
                          {dept.sessionCount}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {pct !== null ? (
                            <span
                              className={`font-semibold ${
                                pct >= 75 ? "text-emerald-400" : "text-amber-400"
                              }`}
                            >
                              {pct}%
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">No sessions held</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-compact overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-normal text-slate-600 dark:text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Class Cohort</th>
                  <th className="px-3 py-2">Division / Sem</th>
                  <th className="px-3 py-2">Academic Year</th>
                  <th className="px-3 py-2 text-center">Students</th>
                  <th className="px-3 py-2 text-center">Sessions Held</th>
                  <th className="px-3 py-2 text-right">Average Attendance %</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800/60 min-h-[150px]">
                {loading && classList.length === 0 ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`skel-class-${idx}`} className="animate-pulse">
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-12" /></td>
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-28" /></td>
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                      <td className="px-3 py-2.5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                      <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-10 mx-auto" /></td>
                      <td className="px-3 py-2.5 text-center"><div className="h-4 bg-slate-800 rounded w-10 mx-auto" /></td>
                      <td className="px-3 py-2.5 text-right"><div className="h-4 bg-slate-800 rounded w-14 ml-auto" /></td>
                    </tr>
                  ))
                ) : classList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No classes found for the selected department.
                    </td>
                  </tr>
                ) : (
                  classList.map((cls) => {
                    const pct = cls.averageAttendancePercentage;
                    return (
                      <tr key={cls.classId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2 font-mono text-blue-400 font-semibold">
                          {cls.departmentCode}
                        </td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-200 font-medium">
                          {cls.label}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          Sem {cls.semesterNumber} - Div {cls.division}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {cls.academicYearLabel}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">
                          {cls.studentCount}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300">
                          {cls.sessionCount}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {pct !== null ? (
                            <span
                              className={`font-semibold ${
                                pct >= 75 ? "text-emerald-400" : "text-amber-400"
                              }`}
                            >
                              {pct}%
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">No sessions held</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
