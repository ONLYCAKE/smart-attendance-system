"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar,
  Plus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  BookOpen,
  Loader2,
  AlertCircle,
  Building,
  GraduationCap,
  Download,
  Printer,
} from "lucide-react";
import {
  TimetableEntryItem,
  listTimetableEntriesApi,
  createTimetableEntryApi,
  updateTimetableEntryApi,
  deleteTimetableEntryApi,
  downloadTimetableCsvApi,
} from "@/features/academic/api/timetable";
import {
  TeacherAssignmentItem,
  listTeacherAssignmentsApi,
} from "@/features/academic/api/teacher-assignments";
import {
  ClassItem,
  listClassesApi,
} from "@/features/academic/api/academic";

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
];

export default function TimetablePage() {
  // Table data state
  const [entries, setEntries] = useState<TimetableEntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // References
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignmentItem[]>([]);

  // Filters
  const [dayFilter, setDayFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [roomFilter, setRoomFilter] = useState("");
  const [debouncedRoom, setDebouncedRoom] = useState("");

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntryItem | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimetableEntryItem | null>(null);

  // Form state
  const [formClassId, setFormClassId] = useState("");
  const [formAssignmentId, setFormAssignmentId] = useState("");
  const [formDayOfWeek, setFormDayOfWeek] = useState(1);
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formRoom, setFormRoom] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await downloadTimetableCsvApi({
        classId: classFilter !== "ALL" ? classFilter : undefined,
        dayOfWeek: dayFilter !== "ALL" ? Number(dayFilter) : undefined,
        room: debouncedRoom || undefined,
      });
    } catch (err: any) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  // 1. Fetch References (Classes and Teacher Assignments)
  const loadReferenceData = useCallback(async () => {
    try {
      const [classesRes, assignmentsRes] = await Promise.all([
        listClassesApi({ active: "true", limit: 100 }),
        listTeacherAssignmentsApi({ active: "true", limit: 100 }),
      ]);
      setClasses(classesRes.data);
      setAssignments(assignmentsRes.data);
    } catch (err) {
      console.error("Failed to load reference data:", err);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // 2. Debounce room search
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (roomFilter === "") {
      setDebouncedRoom("");
      setPage(1);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      setDebouncedRoom(roomFilter);
      setPage(1);
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [roomFilter]);

  // 3. Load Timetable data
  const loadTimetable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTimetableEntriesApi({
        classId: classFilter !== "ALL" ? classFilter : undefined,
        dayOfWeek: dayFilter !== "ALL" ? Number(dayFilter) : undefined,
        room: debouncedRoom || undefined,
        page,
        limit,
      });
      setEntries(res.data);
      setTotal(res.meta?.total || 0);
      setTotalPages(res.meta?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load timetable:", err);
    } finally {
      setLoading(false);
    }
  }, [classFilter, dayFilter, debouncedRoom, page, limit]);

  useEffect(() => {
    loadTimetable();
  }, [loadTimetable]);

  // Filter assignments by the currently selected formClassId
  const availableAssignments = assignments.filter((a) => a.classId === formClassId);

  const handleOpenCreate = () => {
    setEditingEntry(null);
    const initialClass = classes[0];
    setFormClassId(initialClass?.id || "");
    const initialAssigns = assignments.filter((a) => a.classId === initialClass?.id);
    setFormAssignmentId(initialAssigns[0]?.id || "");
    setFormDayOfWeek(1);
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormRoom("");
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: TimetableEntryItem) => {
    setEditingEntry(entry);
    setFormClassId(entry.classId);
    setFormAssignmentId(entry.teacherAssignmentId);
    setFormDayOfWeek(entry.dayOfWeek);
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormRoom(entry.room || "");
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    const selectedAssignment = assignments.find((a) => a.id === formAssignmentId);
    if (!selectedAssignment) {
      setModalError("Please select a valid teacher assignment");
      setSubmitting(false);
      return;
    }

    try {
      if (editingEntry) {
        await updateTimetableEntryApi(editingEntry.id, {
          classId: formClassId,
          subjectId: selectedAssignment.subjectId,
          teacherAssignmentId: formAssignmentId,
          dayOfWeek: Number(formDayOfWeek),
          startTime: formStartTime,
          endTime: formEndTime,
          room: formRoom.trim() || undefined,
        });
        setActionSuccess("Timetable slot updated successfully");
      } else {
        await createTimetableEntryApi({
          classId: formClassId,
          subjectId: selectedAssignment.subjectId,
          teacherAssignmentId: formAssignmentId,
          dayOfWeek: Number(formDayOfWeek),
          startTime: formStartTime,
          endTime: formEndTime,
          room: formRoom.trim() || undefined,
        });
        setActionSuccess("Timetable slot scheduled successfully");
      }
      setIsModalOpen(false);
      loadTimetable();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to save timetable slot");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;
    setSubmitting(true);
    setModalError(null);

    try {
      const res = await deleteTimetableEntryApi(deletingEntry.id);
      setActionSuccess(res.message);
      setDeletingEntry(null);
      loadTimetable();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to delete timetable entry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="p-0.5 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Scheduled Slots</p>
              <p className="text-xl font-bold mt-0.5">{total}</p>
            </div>
            <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Class Cohorts</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {classes.length}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Faculty Assignments</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {assignments.length}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between min-h-14 gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-indigo-600" />
              <div>
                <h1 className="text-base font-semibold leading-none">Weekly Timetable</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Manage class schedules, room allocations, and schedule conflict prevention
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={handleExportCsv}
                disabled={exporting || loading}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors disabled:opacity-50"
                title="Export filtered timetable as CSV"
              >
                {exporting ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                )}
                Export CSV
              </button>
              <button
                onClick={() => window.print()}
                disabled={loading}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
                title="Print timetable schedule"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Print Schedule
              </button>
              <button
                onClick={loadTimetable}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </button>
              <button
                onClick={handleOpenCreate}
                className="h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center transition-colors"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Schedule Slot
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            <select
              value={dayFilter}
              onChange={(e) => {
                setDayFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Days</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Filter by room..."
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="h-7 px-2.5 pl-8 pr-7 text-xs border border-border rounded-md w-36 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {roomFilter && (
                <button
                  type="button"
                  onClick={() => setRoomFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-compact transition-opacity duration-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-secondary-foreground/80 font-normal">
                <th className="px-3 py-2 font-medium">Day & Time Interval</th>
                <th className="px-3 py-2 font-medium">Class / Cohort</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Faculty Member</th>
                <th className="px-3 py-2 font-medium">Room / Resource</th>
                <th className="px-3 py-2 font-medium">Sessions Recorded</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="min-h-[200px] divide-y divide-border">
              {loading && entries.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-28" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-20" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-28" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-24" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-16" /></td>
                    <td className="px-3 py-2.5"><div className="h-4 bg-muted rounded w-12" /></td>
                    <td className="px-3 py-2.5 text-right"><div className="h-6 bg-muted rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No timetable entries scheduled</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Click &apos;Add Schedule Slot&apos; to schedule lecture periods
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((item) => {
                  const dayName = DAYS_OF_WEEK.find((d) => d.value === item.dayOfWeek)?.short || `Day ${item.dayOfWeek}`;
                  return (
                    <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">
                          {dayName} · {item.startTime} - {item.endTime}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Interval: [{item.startTime}, {item.endTime})
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{item.class.label}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {item.class.department?.code}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{item.subject.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {item.subject.code}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">
                          {item.teacherAssignment.teacher.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {item.teacherAssignment.teacher.email}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {item.room ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 border border-border">
                            <Building className="w-3 h-3 text-muted-foreground" />
                            {item.room}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          {item._count?.sessions || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Edit Slot"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setDeletingEntry(item);
                              setModalError(null);
                            }}
                            className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete Slot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap justify-between items-center gap-2.5 min-h-12 border-t border-border px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-6 px-1.5 text-xs border border-border rounded bg-transparent focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} ({total} slots)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-6 px-2 text-xs border border-border rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-6 px-2 text-xs border border-border rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create / Edit Timetable Slot */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">
                  {editingEntry ? "Edit Timetable Slot" : "Add Timetable Slot"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-4 space-y-3 text-xs">
              {modalError && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Class / Cohort
                </label>
                <select
                  required
                  value={formClassId}
                  onChange={(e) => {
                    const newClassId = e.target.value;
                    setFormClassId(newClassId);
                    const classAssigns = assignments.filter((a) => a.classId === newClassId);
                    setFormAssignmentId(classAssigns[0]?.id || "");
                  }}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.department?.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Teacher & Subject Assignment
                </label>
                <select
                  required
                  value={formAssignmentId}
                  onChange={(e) => setFormAssignmentId(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Faculty Assignment</option>
                  {availableAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.subject.code} - {a.subject.name} ({a.teacher.name})
                    </option>
                  ))}
                </select>
                {formClassId && availableAssignments.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No active teacher assignments exist for this class. Please assign a teacher in Faculty Assignments first.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Day of Week
                </label>
                <select
                  required
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    Start Time (HH:MM)
                  </label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    End Time (HH:MM)
                  </label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Room / Lecture Hall (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lab-301, Hall-A"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formAssignmentId}
                  className="h-7 px-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingEntry ? "Save Slot" : "Schedule Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Confirm Deletion</h3>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Are you sure you want to delete the schedule slot for{" "}
                <span className="font-semibold text-foreground">
                  {deletingEntry.class.label}
                </span>{" "}
                ({deletingEntry.subject.name}) on Day {deletingEntry.dayOfWeek} from{" "}
                {deletingEntry.startTime} to {deletingEntry.endTime}?
              </p>

              {deletingEntry._count && deletingEntry._count.sessions > 0 && (
                <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                  <p className="font-medium">
                    {deletingEntry._count.sessions} attendance session(s) are recorded against this timetable slot.
                  </p>
                  <p className="mt-1 text-[11px]">
                    Deletion is blocked to protect historical attendance records.
                  </p>
                </div>
              )}

              {modalError && (
                <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setDeletingEntry(null)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDelete}
                  className="h-7 px-3 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Delete Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
