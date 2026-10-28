"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Lock,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Check,
  X,
  Camera,
  Edit3,
  UserCheck,
} from "lucide-react";
import { SessionDetailsData, RosterStudent } from "./types";
import { getSessionByIdApi, closeSessionApi, markAttendanceApi, correctAttendanceRecordApi } from "./api";
import { AttendanceStatus, AttendanceMethod } from "@smart-attendance/shared";
import { CameraScanner } from "./components/camera-scanner";

interface SessionDashboardProps {
  sessionId: string;
}

export function SessionDashboard({ sessionId }: SessionDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<SessionDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);

  // Attendance Correction Modal State
  const [correctionTarget, setCorrectionTarget] = useState<{
    recordId: string;
    studentName: string;
    rollNumber: string;
    currentStatus: AttendanceStatus;
  } | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>(AttendanceStatus.PRESENT);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const handleOpenCorrection = (student: RosterStudent) => {
    if (!student.attendance) return;
    setCorrectionTarget({
      recordId: student.attendance.id,
      studentName: student.name,
      rollNumber: student.rollNumber,
      currentStatus: student.attendance.status,
    });
    setCorrectionStatus(student.attendance.status);
    setCorrectionReason("");
    setCorrectionError(null);
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setCorrectionError("A correction reason of at least 5 characters is mandatory.");
      return;
    }

    try {
      setCorrectionSubmitting(true);
      setCorrectionError(null);
      await correctAttendanceRecordApi(correctionTarget.recordId, {
        status: correctionStatus,
        correctionReason: correctionReason.trim(),
      });
      setCorrectionTarget(null);
      await loadSession();
    } catch (err: any) {
      setCorrectionError(err.response?.data?.error?.message || err.message || "Failed to submit correction");
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const loadSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSessionByIdApi(sessionId);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleMarkStatus = async (studentId: string, status: AttendanceStatus) => {
    if (!data || data.session.status !== "ACTIVE") return;

    try {
      setActionLoading(studentId);
      setError(null);
      await markAttendanceApi(sessionId, [
        {
          studentId,
          status,
          method: AttendanceMethod.MANUAL_TEACHER,
        },
      ]);
      await loadSession();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to update attendance");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseSession = async () => {
    try {
      setActionLoading("CLOSING");
      setError(null);
      await closeSessionApi(sessionId);
      setShowCloseModal(false);
      await loadSession();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || "Failed to close session");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-sm transition-colors">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
        <p className="text-xs text-slate-600 dark:text-slate-400">Loading attendance session details...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-sm transition-colors">
        <AlertTriangle className="w-8 h-8 text-amber-500 dark:text-amber-400 mx-auto" />
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-200">Session Not Found</h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">Unable to retrieve lecture session details.</p>
        <button
          onClick={() => router.push("/sessions")}
          className="text-xs px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 transition"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  const { session, summary, roster } = data;
  const isActive = session.status === "ACTIVE";

  return (
    <div className="space-y-4">
      {/* Top Session Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/sessions")}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20">
                {session.subject.code}
              </span>
              <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{session.subject.name}</h1>
              {isActive ? (
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Class: {session.class.label} • Division: {session.class.division} • Teacher: {session.teacher.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSession}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Roster
          </button>
          {isActive && (
            <>
              <button
                onClick={() => setShowScannerModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition"
              >
                <Camera className="w-3.5 h-3.5" />
                Live Face Scanner
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={actionLoading === "CLOSING"}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Finalize & Close Session
              </button>
            </>
          )}
        </div>
      </div>

      {/* Safety Notice */}
      <div className="bg-indigo-50/60 dark:bg-slate-900/60 border border-indigo-100 dark:border-slate-800 p-3 rounded-lg text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5 transition-colors">
        <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-800 dark:text-slate-300">Session Attendance Controls:</strong> Attendance is strictly bound to this active
          session and class cohort. Automated facial recognition is an identity-assistance mechanism; teachers maintain manual
          override and status correction authority at all times.
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200">
            ×
          </button>
        </div>
      )}

      {/* Live Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-colors">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Enrolled</p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{summary.totalStudents}</p>
        </div>
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-colors">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Present</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{summary.presentCount}</p>
        </div>
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-colors">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">Absent</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{summary.absentCount}</p>
        </div>
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-colors">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Late</p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">{summary.lateCount}</p>
        </div>
        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl col-span-2 sm:col-span-1 shadow-sm transition-colors">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unrecorded</p>
          <p className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-1">{summary.unrecordedCount}</p>
        </div>
      </div>

      {/* Student Attendance Roster Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm transition-colors">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
          <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Class Student Roster ({roster.length})
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isActive ? "Click any status to record or override attendance" : "Session Finalized (Read-Only)"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 uppercase text-[11px] border-b border-slate-200 dark:border-slate-800 font-semibold tracking-wider">
              <tr>
                <th className="px-3.5 py-2.5">Roll No</th>
                <th className="px-3.5 py-2.5">Student Name</th>
                <th className="px-3.5 py-2.5">Biometric Profile</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Method</th>
                <th className="px-3.5 py-2.5">Time & Notes</th>
                <th className="px-3.5 py-2.5 text-right">Teacher Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {roster.map((s) => {
                const att = s.attendance;
                const isMarking = actionLoading === s.studentId;

                return (
                  <tr key={s.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3.5 py-2.5 font-mono font-medium text-slate-900 dark:text-slate-200">
                      {s.rollNumber}
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {s.name}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {s.hasActiveBiometric ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" /> Enrolled
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Unenrolled</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {att?.status === AttendanceStatus.PRESENT ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3 h-3" /> Present
                        </span>
                      ) : att?.status === AttendanceStatus.ABSENT ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                          <X className="w-3 h-3" /> Absent
                        </span>
                      ) : att?.status === AttendanceStatus.LATE ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" /> Late
                        </span>
                      ) : att?.status === AttendanceStatus.EXCUSED ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Excused
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-[11px] italic">Not Marked</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {att?.method === AttendanceMethod.FACE_RECOGNITION ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                          <Camera className="w-3 h-3" /> Face ({((att.confidence ?? 0) * 100).toFixed(0)}%)
                        </span>
                      ) : att?.method === AttendanceMethod.MANUAL_TEACHER ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                          <UserCheck className="w-3 h-3" /> Teacher Manual
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">
                      {att?.markedAt ? (
                        <div className="space-y-0.5">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                            {new Date(att.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {att.correctionReason && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400/90 truncate max-w-[150px]" title={att.correctionReason}>
                              Reason: {att.correctionReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {isActive ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isMarking}
                            onClick={() => handleMarkStatus(s.studentId, AttendanceStatus.PRESENT)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              att?.status === AttendanceStatus.PRESENT
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/60 text-slate-700 hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400 border border-slate-300 dark:border-slate-700"
                            }`}
                          >
                            P
                          </button>
                          <button
                            type="button"
                            disabled={isMarking}
                            onClick={() => handleMarkStatus(s.studentId, AttendanceStatus.ABSENT)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              att?.status === AttendanceStatus.ABSENT
                                ? "bg-red-600 text-white"
                                : "bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/60 text-slate-700 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400 border border-slate-300 dark:border-slate-700"
                            }`}
                          >
                            A
                          </button>
                          <button
                            type="button"
                            disabled={isMarking}
                            onClick={() => handleMarkStatus(s.studentId, AttendanceStatus.LATE)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              att?.status === AttendanceStatus.LATE
                                ? "bg-amber-600 text-white"
                                : "bg-slate-100 hover:bg-amber-50 dark:bg-slate-800 dark:hover:bg-amber-950/60 text-slate-700 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 border border-slate-300 dark:border-slate-700"
                            }`}
                          >
                            L
                          </button>
                          {att && (
                            <button
                              type="button"
                              onClick={() => handleOpenCorrection(s)}
                              title="Audit Correction"
                              className="p-1 rounded text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : att ? (
                        <button
                          type="button"
                          onClick={() => handleOpenCorrection(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded border border-slate-300 dark:border-slate-700 transition"
                        >
                          <Edit3 className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                          <span>Correct</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Locked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance Correction Modal */}
      {correctionTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Edit3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold">Attendance Correction</h3>
              </div>
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <p>Student: <strong>{correctionTarget.studentName}</strong> ({correctionTarget.rollNumber})</p>
              <p>Current Status: <span className="font-semibold text-indigo-600 dark:text-indigo-300">{correctionTarget.currentStatus}</span></p>
            </div>

            <form onSubmit={handleSubmitCorrection} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Updated Status <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Present", value: AttendanceStatus.PRESENT },
                    { label: "Absent", value: AttendanceStatus.ABSENT },
                    { label: "Late", value: AttendanceStatus.LATE },
                    { label: "Excused", value: AttendanceStatus.EXCUSED },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCorrectionStatus(opt.value)}
                      className={`py-1.5 text-xs font-medium rounded-lg border transition ${
                        correctionStatus === opt.value
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Correction Reason (Mandatory Audit Trail) <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Student presented valid medical certificate / Teacher visual verification"
                  rows={3}
                  className="w-full rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Minimum 5 characters. This will be permanently recorded in the audit log.</p>
              </div>

              {correctionError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{correctionError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCorrectionTarget(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionSubmitting || !correctionReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {correctionSubmitting ? "Saving..." : "Submit Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold">Finalize and Close Session?</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Finalizing this session will mark it as <strong>COMPLETED</strong>. All marked attendance records will be locked
              and historical audit records preserved. Any subsequent status corrections will require an explicit administrative
              or teacher override reason.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleCloseSession}
                disabled={actionLoading === "CLOSING"}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {actionLoading === "CLOSING" ? "Closing..." : "Confirm & Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Recognition Camera Scanner Modal */}
      {showScannerModal && (
        <CameraScanner
          sessionId={sessionId}
          onAttendanceUpdated={loadSession}
          onClose={() => setShowScannerModal(false)}
        />
      )}
    </div>
  );
}
