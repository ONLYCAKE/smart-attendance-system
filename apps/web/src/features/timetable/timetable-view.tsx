"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  GraduationCap,
  Layers,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Grid3X3,
  List,
  Download,
  Printer,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import {
  TimetableEntryItem,
  MyTimetableData,
  getMyTimetableApi,
  downloadTimetableCsvApi,
} from "@/features/academic/api/timetable";
import { createSessionApi } from "@/features/sessions/api";

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

export function TimetableView() {
  const router = useRouter();
  const [data, setData] = useState<MyTimetableData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<"GRID" | "LIST">("GRID");
  const [startingEntryId, setStartingEntryId] = useState<string | null>(null);

  const loadTimetable = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getMyTimetableApi();
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to load academic timetable"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDirectStartSession = async (entry: TimetableEntryItem) => {
    try {
      setStartingEntryId(entry.id);
      setError(null);
      const session = await createSessionApi({
        timetableEntryId: entry.id,
        classId: entry.classId,
        subjectId: entry.subjectId,
      });
      router.push(`/sessions/${session.id}`);
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to start attendance session"
      );
      setStartingEntryId(null);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      setError(null);
      await downloadTimetableCsvApi();
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to export timetable schedule as CSV"
      );
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    loadTimetable();
  }, [loadTimetable]);

  // Today's day of the week (1=Mon..7=Sun)
  const currentDayOfWeek = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  }, []);

  // Filter entries by day
  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];
    if (selectedDay === "ALL") return data.entries;
    return data.entries.filter((e) => e.dayOfWeek === selectedDay);
  }, [data, selectedDay]);

  // Group entries by day for Grid view
  const entriesByDay = useMemo(() => {
    const grouped: Record<number, TimetableEntryItem[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
    };
    (data?.entries || []).forEach((e) => {
      const dayList = grouped[e.dayOfWeek];
      if (dayList) {
        dayList.push(e);
      }
    });
    return grouped;
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Top Banner & Context Info */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              {data?.role === "STUDENT"
                ? "Academic Class Timetable"
                : data?.role === "TEACHER"
                ? "Teacher Course Schedule"
                : "Institution Timetable Schedule"}
              {data?.class && (
                <span className="text-xs font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  {data.class.label}
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data?.role === "STUDENT" && data?.class
                ? `${data.class.department.name} • Semester ${data.class.semesterNumber} (Div ${data.class.division})`
                : data?.role === "TEACHER" && data?.teacher
                ? `Instructor: ${data.teacher.name} • Assigned lecture periods & rooms`
                : "Weekly lecture sessions, room assignments, and course slots"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 print:hidden flex-wrap">
          {/* View mode toggle */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-xs">
            <button
              onClick={() => setViewMode("GRID")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "GRID"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Weekly Grid View"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("LIST")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "LIST"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Day List View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={exporting || loading || !data?.hasPlacement}
            className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50 shadow-sm"
            title="Download CSV timetable export"
          >
            {exporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Download className="w-3.5 h-3.5 text-primary" />
            )}
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={loading || !data?.hasPlacement}
            className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50 shadow-sm"
            title="Print schedule or save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-500" />
            <span>Print Schedule</span>
          </button>

          <button
            onClick={loadTimetable}
            disabled={loading}
            className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Printable schedule banner (visible only on browser print) */}
      <div className="hidden print:block mb-4 pb-3 border-b-2 border-slate-800">
        <h1 className="text-xl font-bold text-black">
          {data?.role === "STUDENT"
            ? `Class Schedule — ${data.class?.label || "Timetable"}`
            : data?.role === "TEACHER"
            ? `Teaching Schedule — ${data.teacher?.name || "Faculty"}`
            : "Institutional Timetable Schedule"}
        </h1>
        <p className="text-xs text-slate-700 mt-1">
          {data?.class && `${data.class.department.name} • Semester ${data.class.semesterNumber} (Division ${data.class.division})`}
          {data?.teacher && `Instructor: ${data.teacher.name} (${data.teacher.email})`}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Smart Attendance System • Weekly Class Schedule
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Unassigned or Pending Placement Warning */}
      {data && !data.hasPlacement && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-center space-y-2.5 transition-colors">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            {data.role === "STUDENT"
              ? "Academic Placement Pending"
              : "No Active Teaching Assignments"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {data.message ||
              "Your academic profile has not been assigned to an active class schedule yet. Please contact the academic administration or department coordinator."}
          </p>
        </div>
      )}

      {/* Day Filter Tabs */}
      {data?.hasPlacement && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin print:hidden">
          <button
            onClick={() => setSelectedDay("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              selectedDay === "ALL"
                ? "bg-card text-primary border border-primary/30 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            All Week (Mon–Sun)
          </button>
          {DAYS_OF_WEEK.map((d) => {
            const count = (entriesByDay[d.value] || []).length;
            const isToday = d.value === currentDayOfWeek;
            return (
              <button
                key={d.value}
                onClick={() => setSelectedDay(d.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                  selectedDay === d.value
                    ? "bg-card text-primary border border-primary/30 shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>{d.label}</span>
                {isToday && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Today" />
                )}
                {count > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Timetable Content */}
      {loading ? (
        <div className="p-16 text-center bg-card border border-border rounded-xl space-y-3 shadow-sm transition-colors">
          <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted-foreground">Loading your academic timetable schedule...</p>
        </div>
      ) : data?.hasPlacement ? (
        viewMode === "GRID" && selectedDay === "ALL" ? (
          /* Weekly Grid View with horizontal scroll protection so columns never squish */
          <div className="overflow-x-auto pb-3 -mx-1 px-1">
            <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 min-w-[1260px] print:min-w-0 print:grid-cols-7 print:auto-cols-auto">
              {DAYS_OF_WEEK.map((d) => {
                const dayEntries = entriesByDay[d.value] || [];
                const isToday = d.value === currentDayOfWeek;
                return (
                  <div
                    key={d.value}
                    className={`bg-card border rounded-xl p-3.5 space-y-3 flex flex-col shadow-xs transition-colors print:bg-white print:border-slate-300 print:p-2 print:break-inside-avoid ${
                      isToday
                        ? "border-primary/50 ring-1 ring-primary/20 bg-primary/5 dark:bg-card print:ring-0"
                        : "border-border"
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between gap-1 border-b border-border/80 pb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-foreground print:text-black">
                          {d.label}
                        </span>
                        {isToday && (
                          <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 print:hidden shrink-0">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                        {dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"}
                      </span>
                    </div>

                    {/* Period Slot Cards */}
                    <div className="space-y-2.5 flex-1 flex flex-col justify-start">
                      {dayEntries.length === 0 ? (
                        <div className="py-8 px-2 flex flex-col items-center justify-center text-center text-muted-foreground/60 text-xs rounded-lg border border-dashed border-border/60 bg-muted/15 my-auto">
                          <Calendar className="w-4 h-4 mb-1 opacity-40" />
                          <span>No lectures</span>
                        </div>
                      ) : (
                        dayEntries.map((e) => (
                          <TimetableCard
                            key={e.id}
                            entry={e}
                            userRole={data.role}
                            currentDayOfWeek={currentDayOfWeek}
                            onStartSession={handleDirectStartSession}
                            isStarting={startingEntryId === e.id}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View or Single Day View */
          <div className="space-y-3">
            {filteredEntries.length === 0 ? (
              <div className="p-12 text-center bg-card border border-border rounded-xl space-y-2 shadow-sm transition-colors print:bg-white print:border-slate-300">
                <Calendar className="w-8 h-8 text-muted-foreground mx-auto print:text-slate-400" />
                <h3 className="text-sm font-semibold text-foreground print:text-black">
                  No classes scheduled
                </h3>
                <p className="text-xs text-muted-foreground print:text-slate-600">
                  {selectedDay === "ALL"
                    ? "There are no lecture entries registered for this academic schedule."
                    : `There are no lecture entries registered for ${
                        DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.label
                      }.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-2">
                {filteredEntries.map((e) => (
                  <TimetableCard
                    key={e.id}
                    entry={e}
                    userRole={data.role}
                    currentDayOfWeek={currentDayOfWeek}
                    onStartSession={handleDirectStartSession}
                    isStarting={startingEntryId === e.id}
                    showDayBadge
                  />
                ))}
              </div>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

// Individual Slot Card Component with Real-Time Session Status & 1-Click Launch
function TimetableCard({
  entry,
  userRole,
  currentDayOfWeek,
  onStartSession,
  isStarting = false,
  showDayBadge = false,
}: {
  entry: TimetableEntryItem;
  userRole: "STUDENT" | "TEACHER" | "ADMIN";
  currentDayOfWeek: number;
  onStartSession?: (entry: TimetableEntryItem) => void;
  isStarting?: boolean;
  showDayBadge?: boolean;
}) {
  const router = useRouter();
  const dayName = DAYS_OF_WEEK.find((d) => d.value === entry.dayOfWeek)?.label || `Day ${entry.dayOfWeek}`;
  const status = getSlotStatus(entry, currentDayOfWeek);

  return (
    <div
      className={`bg-background border rounded-lg p-3 space-y-2.5 transition shadow-xs group print:bg-white print:border-slate-300 print:shadow-none print:break-inside-avoid ${
        status.type === "ACTIVE"
          ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/10"
          : status.type === "MISSED"
          ? "border-red-500/40 bg-red-500/5 dark:bg-red-950/10"
          : status.type === "COMPLETED"
          ? "border-emerald-500/30 bg-background"
          : "border-border hover:border-border/80 hover:bg-muted/30"
      }`}
    >
      {/* Top Slot Header: Time & Room */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shrink-0 whitespace-nowrap">
          <Clock className="w-3 h-3 text-primary shrink-0" />
          {entry.startTime} – {entry.endTime}
        </span>

        {entry.room ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0 whitespace-nowrap">
            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
            {entry.room}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground shrink-0">TBA</span>
        )}
      </div>

      {/* Real-time Status Badge */}
      <div className="flex items-center justify-between gap-1.5">
        {status.type === "ACTIVE" ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Session
          </span>
        ) : status.type === "COMPLETED" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {status.label}
          </span>
        ) : status.type === "MISSED" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            {status.label}
          </span>
        ) : status.type === "DUE_NOW" ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
            Ready to Start
          </span>
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            {status.label}
          </span>
        )}

        {showDayBadge && (
          <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3 text-muted-foreground" />
            {dayName}
          </span>
        )}
      </div>

      {/* Subject Information */}
      <div className="space-y-0.5">
        <div className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
          {entry.subject.code}
        </div>
        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition line-clamp-2 leading-snug">
          {entry.subject.name}
        </div>
      </div>

      {/* Context: Teacher or Class depending on role */}
      <div className="pt-2 border-t border-border/70 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
        {userRole === "STUDENT" ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <GraduationCap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate text-foreground font-medium">
              {entry.teacherAssignment?.teacher?.name || "Faculty Assigned"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate font-mono font-medium text-foreground">
              {entry.class.label}
            </span>
          </div>
        )}

        {userRole === "TEACHER" && (
          <Link
            href="/sessions"
            className="text-[11px] text-primary hover:underline flex items-center gap-0.5 shrink-0 print:hidden font-medium whitespace-nowrap pl-1"
          >
            <span>Sessions</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* 1-Click Action Button for Teachers */}
      {userRole === "TEACHER" && (
        <div className="pt-1 print:hidden">
          {status.type === "ACTIVE" && status.sessionId ? (
            <button
              type="button"
              onClick={() => router.push(`/sessions/${status.sessionId}`)}
              className="w-full h-7 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md flex items-center justify-center gap-1.5 shadow-xs transition"
            >
              Resume Live Session <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : status.type === "COMPLETED" && status.sessionId ? (
            <button
              type="button"
              onClick={() => router.push(`/sessions/${status.sessionId}`)}
              className="w-full h-7 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md flex items-center justify-center gap-1.5 transition"
            >
              View Attendance <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartSession?.(entry)}
              disabled={isStarting}
              className={`w-full h-7 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 ${
                status.type === "MISSED"
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : status.type === "DUE_NOW"
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white ring-2 ring-indigo-500/30"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              }`}
            >
              {isStarting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              <span>{status.type === "MISSED" ? "Start Late Session" : "Start Session"}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getSlotStatus(entry: TimetableEntryItem, currentDayOfWeek: number) {
  const now = new Date();

  // Parse slot start and end minutes
  const [startH = 0, startM = 0] = entry.startTime.split(":").map(Number);
  const [endH = 0, endM = 0] = entry.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const sessions = entry.sessions || [];

  // 1. Is there an ACTIVE session right now?
  const activeSession = sessions.find((s) => s.status === "ACTIVE");
  if (activeSession) {
    return {
      type: "ACTIVE" as const,
      label: "Live Now",
      sessionId: activeSession.id,
      recordsCount: activeSession._count?.records ?? 0,
    };
  }

  // 2. Check if a session was completed for this slot today
  const todayDateStr = now.toDateString();
  const completedToday = sessions.find(
    (s) => s.status === "COMPLETED" && new Date(s.startsAt).toDateString() === todayDateStr
  );
  if (completedToday) {
    return {
      type: "COMPLETED" as const,
      label: `Completed (${completedToday._count?.records ?? 0} Present)`,
      sessionId: completedToday.id,
      recordsCount: completedToday._count?.records ?? 0,
    };
  }

  // If this entry is for TODAY:
  if (entry.dayOfWeek === currentDayOfWeek) {
    // If the lecture time has passed and no session was conducted:
    if (nowMinutes > endMinutes) {
      return {
        type: "MISSED" as const,
        label: "Lecture Missed",
      };
    }
    // If current time is within or right before the slot (15 min prior up to end):
    if (nowMinutes >= startMinutes - 15 && nowMinutes <= endMinutes) {
      return {
        type: "DUE_NOW" as const,
        label: "Ready to Start",
      };
    }
    // Otherwise it's upcoming today:
    return {
      type: "UPCOMING_TODAY" as const,
      label: "Upcoming Today",
    };
  }

  // If this entry is on a PAST day of this week:
  if (entry.dayOfWeek < currentDayOfWeek) {
    const recentCompleted = sessions.find((s) => s.status === "COMPLETED");
    if (recentCompleted) {
      return {
        type: "COMPLETED" as const,
        label: `Completed (${recentCompleted._count?.records ?? 0} Present)`,
        sessionId: recentCompleted.id,
        recordsCount: recentCompleted._count?.records ?? 0,
      };
    }
    return {
      type: "MISSED" as const,
      label: "Missed",
    };
  }

  // Future day this week:
  return {
    type: "SCHEDULED" as const,
    label: "Scheduled",
  };
}
