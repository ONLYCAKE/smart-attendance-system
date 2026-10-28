"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  UserCheck,
  Plus,
  UserPlus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Calendar,
  Loader2,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import {
  TeacherAssignmentItem,
  TeacherUserItem,
  TeacherAssignmentStats,
  listTeacherAssignmentsApi,
  getTeacherAssignmentStatsApi,
  getTeachersListApi,
  createTeacherUserApi,
  createTeacherAssignmentApi,
  updateTeacherAssignmentApi,
  deleteTeacherAssignmentApi,
} from "@/features/academic/api/teacher-assignments";
import {
  ClassItem,
  SubjectItem,
  listClassesApi,
  listSubjectsApi,
} from "@/features/academic/api/academic";

export default function TeacherAssignmentsPage() {
  // Stats state
  const [stats, setStats] = useState<TeacherAssignmentStats>({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Table data state
  const [assignments, setAssignments] = useState<TeacherAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Reference options
  const [teachers, setTeachers] = useState<TeacherUserItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<TeacherAssignmentItem[]>([]);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "true" | "false">("ALL");

  // Focus and debounce management
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<TeacherAssignmentItem | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<TeacherAssignmentItem | null>(null);

  // Form states
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Teacher Creation Modal states
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("Password123!");
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [teacherModalError, setTeacherModalError] = useState<string | null>(null);

  // 1. Fetch Stats independently
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getTeacherAssignmentStatsApi();
      setStats(data);
    } catch (err) {
      console.error("Failed to load assignment stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 2. Fetch Reference Data (Teachers, Classes, Subjects, and All Assignments)
  const loadReferenceData = useCallback(async () => {
    try {
      const [teachersRes, classesRes, subjectsRes, allAssignRes] = await Promise.all([
        getTeachersListApi(),
        listClassesApi({ active: "true", limit: 100 }),
        listSubjectsApi({ active: "true", limit: 100 }),
        listTeacherAssignmentsApi({ limit: 500 }),
      ]);
      setTeachers(teachersRes);
      setClasses(classesRes.data);
      setSubjects(subjectsRes.data);
      setAllAssignments(allAssignRes.data);
    } catch (err) {
      console.error("Failed to load reference data:", err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadReferenceData();
  }, [loadStats, loadReferenceData]);

  // 3. Debounce search input
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (searchInput === "") {
      setDebouncedSearch("");
      setPage(1);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  // 4. Load Assignments table data
  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTeacherAssignmentsApi({
        search: debouncedSearch || undefined,
        teacherUserId: teacherFilter !== "ALL" ? teacherFilter : undefined,
        classId: classFilter !== "ALL" ? classFilter : undefined,
        active: statusFilter !== "ALL" ? statusFilter : undefined,
        page,
        limit,
      });
      setAssignments(res.data);
      setTotal(res.meta?.total || 0);
      setTotalPages(res.meta?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load teacher assignments:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, teacherFilter, classFilter, statusFilter, page, limit]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Available subjects filtered by selected class's department to prevent mismatch
  const selectedClass = classes.find((c) => c.id === formClassId);
  const eligibleSubjects = selectedClass
    ? subjects.filter((s) => s.departmentId === selectedClass.departmentId)
    : subjects;

  const conflictingAssignment = useMemo(() => {
    if (!formClassId || !formSubjectId) return null;
    return allAssignments.find(
      (a) =>
        a.classId === formClassId &&
        a.subjectId === formSubjectId &&
        (!editingAssignment || a.id !== editingAssignment.id)
    );
  }, [formClassId, formSubjectId, allAssignments, editingAssignment]);

  const handleOpenCreate = () => {
    setEditingAssignment(null);
    setFormTeacherId(teachers[0]?.id || "");
    const initialClass = classes[0];
    setFormClassId(initialClass?.id || "");
    const initialSubjects = initialClass
      ? subjects.filter((s) => s.departmentId === initialClass.departmentId)
      : subjects;
    const unassignedSub = initialSubjects.find(
      (s) => !allAssignments.some((a) => a.classId === initialClass?.id && a.subjectId === s.id)
    );
    setFormSubjectId(unassignedSub?.id || initialSubjects[0]?.id || "");
    setFormActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: TeacherAssignmentItem) => {
    setEditingAssignment(item);
    setFormTeacherId(item.teacherUserId);
    setFormClassId(item.classId);
    setFormSubjectId(item.subjectId);
    setFormActive(item.active);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment && conflictingAssignment) {
      setModalError(
        `Subject '${conflictingAssignment.subject?.name}' (${conflictingAssignment.subject?.code}) is already assigned to '${conflictingAssignment.teacher?.name}' for this class.`
      );
      return;
    }
    setSubmitting(true);
    setModalError(null);

    try {
      if (editingAssignment) {
        await updateTeacherAssignmentApi(editingAssignment.id, {
          teacherUserId: formTeacherId,
          classId: formClassId,
          subjectId: formSubjectId,
          active: formActive,
        });
        setActionSuccess("Assignment updated successfully");
      } else {
        await createTeacherAssignmentApi({
          teacherUserId: formTeacherId,
          classId: formClassId,
          subjectId: formSubjectId,
        });
        setActionSuccess("Teacher assigned successfully");
      }
      setIsModalOpen(false);
      loadAssignments();
      loadStats();
      loadReferenceData();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to save teacher assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAssignment) return;
    setSubmitting(true);
    setModalError(null);

    try {
      const res = await deleteTeacherAssignmentApi(deletingAssignment.id);
      setActionSuccess(res.message);
      setDeletingAssignment(null);
      loadAssignments();
      loadStats();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to delete assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim() || !teacherEmail.trim()) {
      setTeacherModalError("Name and institutional email are required.");
      return;
    }
    setCreatingTeacher(true);
    setTeacherModalError(null);

    try {
      const newTeacher = await createTeacherUserApi({
        name: teacherName.trim(),
        email: teacherEmail.trim(),
        password: teacherPassword.trim() || undefined,
      });
      setActionSuccess(`Faculty teacher "${newTeacher.name}" added successfully.`);
      setIsTeacherModalOpen(false);
      await loadReferenceData();
      setFormTeacherId(newTeacher.id);
    } catch (err: any) {
      setTeacherModalError(err.response?.data?.error?.message || "Failed to add faculty teacher.");
    } finally {
      setCreatingTeacher(false);
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
              <p className="text-xs text-muted-foreground">Total Assignments</p>
              <p className="text-xl font-bold mt-0.5">
                {statsLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline text-muted-foreground" />
                ) : (
                  stats.total
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Active Assignments</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {statsLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline text-muted-foreground" />
                ) : (
                  stats.active
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Inactive Assignments</p>
              <p className="text-xl font-bold text-zinc-500 mt-0.5">
                {statsLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline text-muted-foreground" />
                ) : (
                  stats.inactive
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-zinc-500" />
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
              <UserCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h1 className="text-base font-semibold leading-none">Teacher Assignments</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Assign faculty to authorized classes and subjects within their departments
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  loadAssignments();
                  loadStats();
                }}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </button>
              <button
                onClick={() => {
                  setTeacherName("");
                  setTeacherEmail("");
                  setTeacherPassword("Password123!");
                  setTeacherModalError(null);
                  setIsTeacherModalOpen(true);
                }}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Add Teacher
              </button>
              <button
                onClick={handleOpenCreate}
                className="h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Assign Teacher
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search teacher or subject..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-7 px-2.5 pl-8 pr-7 text-xs border border-border rounded-md w-48 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={teacherFilter}
              onChange={(e) => {
                setTeacherFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Status</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-compact transition-opacity duration-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-secondary-foreground/80 font-normal">
                <th className="px-3 py-2 font-medium">Teacher</th>
                <th className="px-3 py-2 font-medium">Class / Cohort</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Timetable Entries</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="min-h-[200px] divide-y divide-border">
              {loading && assignments.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-28" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-24" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-28" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-16" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-12" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-5 bg-muted rounded w-14" />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="h-6 bg-muted rounded w-12 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No teacher assignments found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Click &apos;Assign Teacher&apos; to link a faculty member to a class and subject
                    </p>
                  </td>
                </tr>
              ) : (
                assignments.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-foreground">{item.teacher.name}</div>
                      <div className="text-[11px] text-muted-foreground">{item.teacher.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{item.class.label}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{item.subject.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {item.subject.code}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 border border-border">
                        {item.class.department?.code || item.subject.department?.code}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        {item._count?.timetableEntries || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {item.active ? (
                        <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Edit Assignment"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingAssignment(item);
                            setModalError(null);
                          }}
                          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete Assignment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
              className="h-6 px-1.5 text-xs border border-border rounded bg-white dark:bg-zinc-800 text-foreground focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} ({total} items)
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

      {/* Modal: Create / Edit Assignment */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">
                  {editingAssignment ? "Edit Teacher Assignment" : "Assign Teacher"}
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
                  Teacher (Active Faculty)
                </label>
                <select
                  required
                  value={formTeacherId}
                  onChange={(e) => setFormTeacherId(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Teacher</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

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
                    const cls = classes.find((c) => c.id === newClassId);
                    if (cls) {
                      const matchSubs = subjects.filter(
                        (s) => s.departmentId === cls.departmentId
                      );
                      setFormSubjectId(matchSubs[0]?.id || "");
                    }
                  }}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
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
                  Subject (Department Scoped)
                </label>
                <select
                  required
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-white dark:bg-zinc-800 text-foreground focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Subject</option>
                  {eligibleSubjects.map((s) => {
                    const assigned = allAssignments.find(
                      (a) =>
                        a.classId === formClassId &&
                        a.subjectId === s.id &&
                        (!editingAssignment || a.id !== editingAssignment.id)
                    );
                    return (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name} ({s.department?.code})
                        {assigned ? ` ⚠️ (Assigned: ${assigned.teacher.name})` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedClass && eligibleSubjects.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No subjects found for department {selectedClass.department?.code}. Please add a subject first.
                  </p>
                )}
              </div>

              {conflictingAssignment && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Subject Already Assigned</p>
                    <p className="text-[11px] mt-0.5">
                      <strong>{conflictingAssignment.subject?.name} ({conflictingAssignment.subject?.code})</strong> is already assigned to <strong>{conflictingAssignment.teacher?.name}</strong> for this class. Each subject in a class can only be assigned to one faculty teacher.
                    </p>
                  </div>
                </div>
              )}

              {editingAssignment && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="assignmentActiveCheck"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="assignmentActiveCheck" className="text-muted-foreground">
                    Active Assignment
                  </label>
                </div>
              )}

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
                  disabled={submitting || !!conflictingAssignment}
                  className="h-7 px-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingAssignment ? "Save Changes" : "Create Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deletingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Confirm Deletion</h3>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Are you sure you want to delete assignment for{" "}
                <span className="font-semibold text-foreground">
                  {deletingAssignment.teacher.name}
                </span>{" "}
                teaching{" "}
                <span className="font-semibold text-foreground">
                  {deletingAssignment.subject.name}
                </span>{" "}
                in{" "}
                <span className="font-semibold text-foreground">
                  {deletingAssignment.class.label}
                </span>
                ?
              </p>

              {deletingAssignment._count && deletingAssignment._count.timetableEntries > 0 && (
                <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                  <p className="font-medium">
                    This assignment has {deletingAssignment._count.timetableEntries} timetable entries linked.
                  </p>
                  <p className="mt-1 text-[11px]">
                    Deletion is protected to preserve academic schedules. Please deactivate instead.
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
                  onClick={() => setDeletingAssignment(null)}
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
                  Delete Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Create Faculty Teacher User */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Add Faculty Teacher</h3>
                  <p className="text-[11px] text-muted-foreground">Register an active faculty login</p>
                </div>
              </div>
              <button
                onClick={() => setIsTeacherModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTeacher} className="p-4 space-y-3.5 text-xs">
              {teacherModalError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-md flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{teacherModalError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Faculty Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. Rajesh Sharma"
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  className="w-full h-8 px-2.5 bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Email Address (Login ID)</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. prof.sharma@college.edu"
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  className="w-full h-8 px-2.5 bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Initial Password</label>
                <input
                  type="text"
                  required
                  placeholder="Password123!"
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="w-full h-8 px-2.5 font-mono bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-muted-foreground">
                  Faculty member can sign in using this email and password.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTeacher}
                  className="h-7 px-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {creatingTeacher && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Faculty Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
