"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sliders,
  Play,
  Check,
  Info,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  getMyNotificationsApi,
  getClassNotificationsApi,
  evaluateAlertsApi,
  markAsReadApi,
  resolveNotificationApi,
  getSettingsApi,
  updateSettingApi,
} from "./api";
import { NotificationItem, NotificationSummary } from "./types";
import { getMyTeacherAssignmentsApi } from "@/features/reports/api";
import { listClassesApi } from "@/features/academic/api/academic";

export function NotificationsView() {
  const { user } = useAuth();

  // State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    total: 0,
    unread: 0,
    read: 0,
    resolved: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Teacher class selection
  const [teacherClasses, setTeacherClasses] = useState<
    Array<{ classId: string; classLabel: string }>
  >([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // Admin threshold settings state
  const [thresholdSetting, setThresholdSetting] = useState<string>("75.0");
  const [editingThreshold, setEditingThreshold] = useState<string>("75.0");
  const [savingSetting, setSavingSetting] = useState(false);
  const [settingSuccess, setSettingSuccess] = useState<string | null>(null);
  const [settingError, setSettingError] = useState<string | null>(null);

  // Evaluation state
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);

  // Action in-flight tracking
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  // Load classes for teacher or admin
  useEffect(() => {
    if (user?.role === "TEACHER") {
      getMyTeacherAssignmentsApi()
        .then((assignments) => {
          const uniqueClasses = Array.from(
            new Map(
              (assignments || []).map((a) => [a.classId, { classId: a.classId, classLabel: a.classLabel }])
            ).values()
          );
          setTeacherClasses(uniqueClasses);
          const first = uniqueClasses[0];
          if (first && !selectedClassId) {
            setSelectedClassId(first.classId);
          }
        })
        .catch(console.error);
    } else if (user?.role === "ADMIN") {
      listClassesApi({ limit: 100 })
        .then((res) => {
          const classes = (res?.data || []).map((c) => ({
            classId: c.id,
            classLabel: `${c.department?.code || ""} - Sem ${c.semesterNumber} ${c.division} (${c.label})`,
          }));
          setTeacherClasses(classes);
          const first = classes[0];
          if (first && !selectedClassId) {
            setSelectedClassId(first.classId);
          }
        })
        .catch(console.error);
    }
  }, [user?.role, selectedClassId]);

  // Load settings if admin
  useEffect(() => {
    if (user?.role === "ADMIN") {
      getSettingsApi()
        .then((settings) => {
          const threshold = settings.find(
            (s) => s.key === "LOW_ATTENDANCE_THRESHOLD_PERCENT"
          );
          if (threshold) {
            setThresholdSetting(threshold.value);
            setEditingThreshold(threshold.value);
          }
        })
        .catch(console.error);
    }
  }, [user?.role]);

  // Fetch notifications
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if ((user?.role === "TEACHER" || user?.role === "ADMIN") && selectedClassId) {
        const res = await getClassNotificationsApi(
          selectedClassId,
          statusFilter !== "ALL" ? { status: statusFilter } : undefined
        );
        const list: NotificationItem[] = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.notifications)
          ? (res as any).notifications
          : [];

        setNotifications(list);
        setSummary({
          total: list.length,
          unread: list.filter((n) => n.status === "UNREAD").length,
          read: list.filter((n) => n.status === "READ").length,
          resolved: list.filter((n) => n.status === "RESOLVED").length,
        });
      } else if (user?.role === "STUDENT") {
        // Default to student / self alerts
        const res = await getMyNotificationsApi(
          statusFilter !== "ALL" ? { status: statusFilter } : undefined
        );
        const list: NotificationItem[] = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.notifications)
          ? (res as any).notifications
          : [];

        setNotifications(list);
        setSummary({
          total: list.length,
          unread: (res as any)?.unreadCount ?? list.filter((n) => n.status === "UNREAD").length,
          read: list.filter((n) => n.status === "READ").length,
          resolved: list.filter((n) => n.status === "RESOLVED").length,
        });
      } else {
        setNotifications([]);
        setSummary({ total: 0, unread: 0, read: 0, resolved: 0 });
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load notifications"
      );
      setNotifications([]);
      setSummary({ total: 0, unread: 0, read: 0, resolved: 0 });
    } finally {
      setLoading(false);
    }
  }, [user?.role, selectedClassId, statusFilter]);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, loadNotifications]);

  // Action handlers
  const handleMarkAsRead = async (id: string) => {
    try {
      setActionInProgress((prev) => ({ ...prev, [id]: true }));
      await markAsReadApi(id);
      await loadNotifications();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || "Failed to mark alert as read");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleResolve = async (id: string) => {
    try {
      setActionInProgress((prev) => ({ ...prev, [id]: true }));
      await resolveNotificationApi(id);
      await loadNotifications();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || "Failed to resolve alert");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleEvaluateAlerts = async () => {
    try {
      setEvaluating(true);
      setEvaluationResult(null);
      const res = await evaluateAlertsApi(
        user?.role === "TEACHER" && selectedClassId ? { classId: selectedClassId } : {}
      );
      setEvaluationResult(
        `Evaluation complete: ${res.evaluated} students checked, ${res.warningsCreatedOrUpdated} warnings active, ${res.resolved} resolved (Threshold: ${res.thresholdPercent}%).`
      );
      await loadNotifications();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || "Failed to evaluate alerts");
    } finally {
      setEvaluating(false);
    }
  };

  const handleSaveThreshold = async () => {
    const val = parseFloat(editingThreshold);
    if (isNaN(val) || val <= 0 || val > 100) {
      setSettingError("Threshold must be a valid number between 1 and 100.");
      return;
    }
    try {
      setSavingSetting(true);
      setSettingError(null);
      setSettingSuccess(null);
      const res = await updateSettingApi(
        "LOW_ATTENDANCE_THRESHOLD_PERCENT",
        editingThreshold.trim()
      );
      setThresholdSetting(res.value);
      setSettingSuccess(`Threshold updated to ${res.value}% successfully.`);
      setTimeout(() => setSettingSuccess(null), 4000);
    } catch (err: any) {
      setSettingError(
        err.response?.data?.error?.message || "Failed to update threshold"
      );
    } finally {
      setSavingSetting(false);
    }
  };

  // Has active low attendance alert?
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const hasActiveWarning = safeNotifications.some(
    (n) =>
      (n.type === "LOW_ATTENDANCE_WARNING" || n.type === "LOW_ATTENDANCE") &&
      n.status !== "RESOLVED"
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Notifications & Attendance Alerts
              {summary.unread > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-mono font-medium">
                  {summary.unread} unread
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automated alerts based on institutional attendance criteria (default 75.0% threshold).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadNotifications}
            disabled={loading}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {(user?.role === "ADMIN" || user?.role === "TEACHER") && (
            <button
              onClick={handleEvaluateAlerts}
              disabled={evaluating}
              className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${evaluating ? "animate-pulse" : ""}`} />
              {evaluating ? "Evaluating..." : "Run Alert Evaluation"}
            </button>
          )}
        </div>
      </div>

      {/* Admin Threshold Management Card */}
      {user?.role === "ADMIN" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Institutional Alert Policy Settings
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Current: <strong className="text-purple-400">{thresholdSetting}%</strong>
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Students whose overall attendance drops strictly below this threshold in eligible held sessions
            (excluding cancelled and future scheduled sessions) will receive an automated low-attendance warning.
            Setting is audited in compliance with security guidelines.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <div className="relative w-44">
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={editingThreshold}
                onChange={(e) => setEditingThreshold(e.target.value)}
                className="h-8 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                placeholder="e.g. 75.0"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-500">%</span>
            </div>

            <button
              onClick={handleSaveThreshold}
              disabled={savingSetting}
              className="h-8 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingSetting ? "Saving..." : "Save Policy Threshold"}
            </button>
          </div>

          {settingSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> {settingSuccess}
            </p>
          )}
          {settingError && (
            <p className="text-xs text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {settingError}
            </p>
          )}
        </div>
      )}

      {/* Evaluation Results Banner */}
      {evaluationResult && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{evaluationResult}</span>
          </div>
          <button
            onClick={() => setEvaluationResult(null)}
            className="text-blue-400 hover:text-blue-200 text-xs px-2 py-0.5"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Prominent Student Warning Banner */}
      {user?.role === "STUDENT" && hasActiveWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 flex items-start gap-3.5 text-amber-800 dark:text-amber-200 shadow-sm animate-in fade-in duration-200">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-300">
              Low Attendance Warning Active
            </h3>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Your overall attended sessions have fallen below the institution requirement of{" "}
              <strong>{thresholdSetting}%</strong>. Please attend all upcoming lectures. If you have approved
              medical or leave certificates, contact your class teacher for manual attendance correction.
            </p>
          </div>
        </div>
      )}

      {/* Class Selection Filter for Teachers and Admins */}
      {(user?.role === "TEACHER" || user?.role === "ADMIN") && teacherClasses.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between flex-wrap gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {user?.role === "ADMIN" ? "Institutional Class Cohort Alerts:" : "Assigned Class Alerts:"}
            </span>
          </div>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="h-8 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
          >
            {teacherClasses.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.classLabel}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Total Alerts</p>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{summary.total}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Historical & active</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Unread Warnings</p>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{summary.unread}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Requires attention</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Acknowledged</p>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{summary.read}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Marked as read</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.resolved}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Attendance recovered</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Tabs and Filter Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1">
          {(["ALL", "UNREAD", "READ", "RESOLVED"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === tab
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
              }`}
            >
              {tab === "ALL" && `All (${summary.total})`}
              {tab === "UNREAD" && `Unread (${summary.unread})`}
              {tab === "READ" && `Read (${summary.read})`}
              {tab === "RESOLVED" && `Resolved (${summary.resolved})`}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-4 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadNotifications}
            className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && safeNotifications.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 animate-pulse space-y-2.5 shadow-sm"
            >
              <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/60 rounded" />
              <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800/40 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && safeNotifications.length === 0 && !error && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Notifications</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {statusFilter === "ALL"
              ? "All attendance thresholds are in good standing. No warnings have been issued."
              : `No alerts currently in ${statusFilter.toLowerCase()} status.`}
          </p>
        </div>
      )}

      {/* Notifications List */}
      {!loading && safeNotifications.length > 0 && (
        <div className="space-y-3">
          {safeNotifications.map((item) => {
            const isUnread = item.status === "UNREAD";
            const isResolved = item.status === "RESOLVED";

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-slate-900 border rounded-xl p-4 transition-all duration-200 space-y-3 shadow-sm ${
                  isUnread
                    ? "border-amber-400 dark:border-amber-500/40 shadow-sm"
                    : isResolved
                    ? "border-slate-200 dark:border-slate-800/60 opacity-80"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Badge */}
                    {isUnread && (
                      <span className="h-5 px-2 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        UNREAD
                      </span>
                    )}
                    {item.status === "READ" && (
                      <span className="h-5 px-2 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        READ
                      </span>
                    )}
                    {isResolved && (
                      <span className="h-5 px-2 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Check className="w-3 h-3" /> RESOLVED
                      </span>
                    )}

                    {/* Alert Type */}
                    <span className="h-5 px-2 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Low Attendance
                    </span>

                    {/* Student Roll / Class for Teachers */}
                    {item.student && (
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {(item.student as any).name ||
                          `${item.student.user?.firstName || ""} ${item.student.user?.lastName || ""}`.trim() ||
                          "Student"}{" "}
                        (Roll: {item.student.rollNumber})
                      </span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Title & Body */}
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.message}</p>
                </div>

                {/* Footer metadata & actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-[11px] text-slate-500">
                    {isResolved && item.resolvedAt && (
                      <span>
                        Resolved on: {new Date(item.resolvedAt).toLocaleDateString()} (attendance
                        recovered or corrected)
                      </span>
                    )}
                    {!isResolved && item.readAt && (
                      <span>Acknowledged on: {new Date(item.readAt).toLocaleDateString()}</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  {user?.role === "STUDENT" && !isResolved && (
                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <button
                          onClick={() => handleMarkAsRead(item.id)}
                          disabled={actionInProgress[item.id]}
                          className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
                        >
                          Mark as Read
                        </button>
                      )}
                      <button
                        onClick={() => handleResolve(item.id)}
                        disabled={actionInProgress[item.id]}
                        className="h-7 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 shadow-sm"
                      >
                        <Check className="w-3 h-3" />
                        Acknowledge & Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
