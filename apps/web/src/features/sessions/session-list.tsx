"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Play,
  Plus,
  RefreshCw,
  Users,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { AttendanceSessionItem } from "./types";
import { listSessionsApi, createSessionApi } from "./api";
import { getMyTeacherAssignmentsApi } from "@/features/reports/api";
import { getMyTimetableApi, TimetableEntryItem } from "@/features/academic/api/timetable";

export function SessionList() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AttendanceSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  // Today's Timetable Schedule State
  const [todayEntries, setTodayEntries] = useState<TimetableEntryItem[]>([]);
  const [startingEntryId, setStartingEntryId] = useState<string | null>(null);

  // New Session Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [classIdInput, setClassIdInput] = useState("");
  const [subjectIdInput, setSubjectIdInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<
    Array<{
      classId: string;
      classLabel: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
    }>
  >([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [useManualInput, setUseManualInput] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listSessionsApi({
        status: statusFilter,
      });
      setSessions(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadTodayTimetable = useCallback(async () => {
    try {
      const res = await getMyTimetableApi();
      if (res?.entries) {
        const todayDayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay();
        const todayList = res.entries.filter((e) => e.dayOfWeek === todayDayOfWeek);
        setTodayEntries(todayList);
      }
    } catch (e) {
      console.warn("Could not load timetable schedule for sessions page", e);
    }
  }, []);

  const handleStartTimetableSession = async (entry: TimetableEntryItem) => {
    try {
      setStartingEntryId(entry.id);
      setError(null);
      const created = await createSessionApi({
        timetableEntryId: entry.id,
        classId: entry.classId,
        subjectId: entry.subjectId,
      });
      router.push(`/sessions/${created.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to start session");
      setStartingEntryId(null);
    }
  };

  useEffect(() => {
    loadSessions();
    loadTodayTimetable();
  }, [loadSessions, loadTodayTimetable]);

  useEffect(() => {
    if (isModalOpen) {
      setLoadingAssignments(true);
      getMyTeacherAssignmentsApi()
        .then((data) => {
          setAssignments(data);
          if (data && data.length > 0 && data[0]) {
            setClassIdInput(data[0].classId);
            setSubjectIdInput(data[0].subjectId);
            setUseManualInput(false);
          } else {
            setUseManualInput(true);
          }
        })
        .catch(() => {
          setUseManualInput(true);
        })
        .finally(() => {
          setLoadingAssignments(false);
        });
    }
  }, [isModalOpen]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classIdInput.trim() || !subjectIdInput.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await createSessionApi({
        classId: classIdInput.trim(),
        subjectId: subjectIdInput.trim(),
      });
      setIsModalOpen(false);
      router.push(`/sessions/${created.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to create session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lecture Attendance Sessions</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live session lifecycle, student roster verification, and attendance tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSessions}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Open Session
          </button>
        </div>
      </div>

      {/* Missed Lecture Warning Alert */}
      {todayEntries.filter((e) => getTodaySlotStatus(e).type === "MISSED").length > 0 && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-700 dark:text-red-400 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              <strong>Missed Lecture Notice:</strong> You have{" "}
              {todayEntries.filter((e) => getTodaySlotStatus(e).type === "MISSED").length}{" "}
              scheduled timetable lecture(s) today where the scheduled period passed without an attendance session.
            </span>
          </div>
          <Link
            href="/timetable"
            className="text-xs font-semibold underline shrink-0 hover:text-red-800 dark:hover:text-red-300 whitespace-nowrap"
          >
            View Timetable →
          </Link>
        </div>
      )}

      {/* Today's Timetable Schedule with 1-Click Launch */}
      {todayEntries.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-sm transition-colors">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Today's Scheduled Timetable ({todayEntries.length}{" "}
                {todayEntries.length === 1 ? "Class" : "Classes"})
              </h2>
            </div>
            <Link
              href="/timetable"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 font-medium"
            >
              Full Timetable Schedule <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayEntries.map((e) => {
              const slot = getTodaySlotStatus(e);
              return (
                <div
                  key={e.id}
                  className={`bg-white dark:bg-slate-900 border rounded-xl p-4 space-y-3 transition shadow-sm ${
                    slot.type === "ACTIVE"
                      ? "border-emerald-500/60 dark:border-emerald-500/40 ring-1 ring-emerald-500/20"
                      : slot.type === "MISSED"
                      ? "border-rose-500/60 dark:border-rose-500/40 ring-1 ring-rose-500/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {/* Top Row: Code on left, Status badge on right */}
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20 font-bold">
                        {e.subject.code}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 transition mt-1.5 line-clamp-1">
                        {e.subject.name}
                      </h3>
                    </div>

                    {slot.type === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        ACTIVE
                      </span>
                    ) : slot.type === "COMPLETED" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                        COMPLETED
                      </span>
                    ) : slot.type === "MISSED" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                        MISSED
                      </span>
                    ) : slot.type === "DUE_NOW" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        READY TO START
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        UPCOMING
                      </span>
                    )}
                  </div>

                  {/* Metadata: Class, Div, Time, Room, Marked */}
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span>
                        Class: <strong className="text-slate-800 dark:text-slate-200 font-medium">{e.class.label}</strong>
                      </span>
                      <span>
                        Div: <strong className="text-slate-800 dark:text-slate-200 font-medium">{e.class.division}</strong>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                        <Clock className="w-3.5 h-3.5" />
                        {e.startTime} – {e.endTime}
                      </span>
                      <span>{e.room ? `Room ${e.room}` : "Room TBA"}</span>
                    </div>
                    {slot.type === "COMPLETED" && (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {slot.recordsCount ?? 0} Marked
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">Session Finalized</span>
                      </div>
                    )}
                  </div>

                  {/* 1-Click Action Button */}
                  <div className="pt-1">
                    {slot.type === "ACTIVE" && slot.sessionId ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/sessions/${slot.sessionId}`)}
                        className="w-full h-8 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition"
                      >
                        Resume Live Session <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ) : slot.type === "COMPLETED" && slot.sessionId ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/sessions/${slot.sessionId}`)}
                        className="w-full h-8 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg flex items-center justify-center gap-1.5 transition"
                      >
                        View Attendance <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartTimetableSession(e)}
                        disabled={startingEntryId === e.id}
                        className={`w-full h-8 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 ${
                          slot.type === "MISSED"
                            ? "bg-amber-600 hover:bg-amber-500 text-white"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white"
                        }`}
                      >
                        {startingEntryId === e.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>{slot.type === "MISSED" ? "Start Late Session" : "Start Session"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {["ALL", "ACTIVE", "COMPLETED"].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === st
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 shadow-sm font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            }`}
          >
            {st === "ALL" ? "All Sessions" : st === "ACTIVE" ? "Active Now" : "Completed"}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200">
            ×
          </button>
        </div>
      )}

      {/* Sessions Grid / Table */}
      {loading ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-sm transition-colors">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading lecture sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-sm transition-colors">
          <Calendar className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">No sessions found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {statusFilter === "ACTIVE"
              ? "There are no active attendance sessions currently in progress."
              : "No lecture sessions match the selected filter. Click 'Open Session' to start a lecture."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => router.push(`/sessions/${s.id}`)}
              className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 cursor-pointer transition shadow-sm space-y-3 group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20">
                    {s.subject.code}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition mt-1.5">
                    {s.subject.name}
                  </h3>
                </div>
                {s.status === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    ACTIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    COMPLETED
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Class: {s.class.label}</span>
                  <span>Div: {s.class.division}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Teacher: {s.teacher.name}</span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {s._count.records} Marked
                  </span>
                </div>
                <div className="pt-1 text-[11px] text-slate-500 border-t border-slate-200 dark:border-slate-800/60">
                  Started: {new Date(s.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •{" "}
                  {new Date(s.startsAt).toLocaleDateString()}
                </div>
              </div>

              <div className="pt-1 flex items-center justify-end text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                Enter Dashboard <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl transition-colors duration-200">
            <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="p-1.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Play className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Open Attendance Session</h3>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-3">
              {loadingAssignments ? (
                <div className="py-4 text-center space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Loading your assigned courses and divisions...</p>
                </div>
              ) : !useManualInput && assignments.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Assigned Class & Subject
                    </label>
                    <button
                      type="button"
                      onClick={() => setUseManualInput(true)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline"
                    >
                      Enter UUIDs manually
                    </button>
                  </div>
                  <select
                    value={`${classIdInput}__${subjectIdInput}`}
                    onChange={(e) => {
                      const chosen = assignments.find(
                        (a) => `${a.classId}__${a.subjectId}` === e.target.value
                      );
                      if (chosen) {
                        setClassIdInput(chosen.classId);
                        setSubjectIdInput(chosen.subjectId);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  >
                    {assignments.map((a) => (
                      <option
                        key={`${a.classId}__${a.subjectId}`}
                        value={`${a.classId}__${a.subjectId}`}
                      >
                        {a.subjectCode} - {a.subjectName} ({a.classLabel})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  {assignments.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setUseManualInput(false)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 hover:underline"
                      >
                        ← Select from assigned courses
                      </button>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Class UUID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 5dbfe4ff-c1b9-4ba2-abd9-748dd2c6c892"
                      value={classIdInput}
                      onChange={(e) => setClassIdInput(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Subject UUID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. c105c317-a068-4663-8889-13fe05063717"
                      value={subjectIdInput}
                      onChange={(e) => setSubjectIdInput(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                The server will verify that you hold an active teacher assignment for this class and subject before opening the session.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? "Opening Session..." : "Open Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getTodaySlotStatus(entry: TimetableEntryItem) {
  const now = new Date();
  const [startH = 0, startM = 0] = entry.startTime.split(":").map(Number);
  const [endH = 0, endM = 0] = entry.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const sessions = entry.sessions || [];

  // Active session
  const activeSession = sessions.find((s) => s.status === "ACTIVE");
  if (activeSession) {
    return {
      type: "ACTIVE" as const,
      label: "Live Now",
      sessionId: activeSession.id,
    };
  }

  // Completed session today
  const todayDateStr = now.toDateString();
  const completedToday = sessions.find(
    (s) => s.status === "COMPLETED" && new Date(s.startsAt).toDateString() === todayDateStr
  );
  if (completedToday) {
    return {
      type: "COMPLETED" as const,
      label: `Completed (${completedToday._count?.records ?? 0} Marked)`,
      sessionId: completedToday.id,
      recordsCount: completedToday._count?.records ?? 0,
    };
  }

  // Missed: lecture end time passed without session conducted
  if (nowMinutes > endMinutes) {
    return {
      type: "MISSED" as const,
      label: "Lecture Missed",
    };
  }

  // Ready to start: within 15 mins of start up to end
  if (nowMinutes >= startMinutes - 15 && nowMinutes <= endMinutes) {
    return {
      type: "DUE_NOW" as const,
      label: "Ready to Start",
    };
  }

  // Upcoming
  return {
    type: "UPCOMING" as const,
    label: "Upcoming Today",
  };
}

