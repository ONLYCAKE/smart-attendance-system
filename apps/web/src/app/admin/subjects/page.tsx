"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Plus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Building2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  SubjectItem,
  AcademicStats,
  listSubjectsApi,
  getSubjectStatsApi,
  createSubjectApi,
  getNextSubjectCodeApi,
  updateSubjectApi,
  deleteSubjectApi,
} from "@/features/academic/api/academic";
import {
  DepartmentListItem,
  listDepartmentsApi,
} from "@/features/academic/api/departments";

export default function SubjectsPage() {
  // Stats state (isolated from filters)
  const [stats, setStats] = useState<AcademicStats>({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // Table data state
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Reference options
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "true" | "false">("ALL");

  // Focus and debounce management
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<SubjectItem | null>(null);

  // Subject Form states
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectDeptId, setSubjectDeptId] = useState("");
  const [subjectActive, setSubjectActive] = useState(true);
  const [autoGeneratingCode, setAutoGeneratingCode] = useState(false);

  // Submissions
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 1. Fetch Stats independently
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getSubjectStatsApi();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to load subject stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 2. Fetch Reference Data (Departments)
  const loadReferenceData = useCallback(async () => {
    try {
      const res = await listDepartmentsApi();
      const depts = res.data;
      setDepartments(depts);
      if (depts.length > 0 && !subjectDeptId) {
        setSubjectDeptId(depts[0]!.id);
      }
    } catch (err: any) {
      console.error("Failed to load departments:", err);
    }
  }, [subjectDeptId]);

  // 3. Load Subjects (Debounced search & filters)
  const loadSubjects = useCallback(
    async (isSearchOp = false) => {
      if (!isSearchOp) setLoading(true);
      try {
        const res = await listSubjectsApi({
          search: debouncedSearch || undefined,
          departmentId: deptFilter !== "ALL" ? deptFilter : undefined,
          active: statusFilter !== "ALL" ? statusFilter === "true" : undefined,
          page,
          limit,
        });
        setSubjects(res.data);
        if (res.meta) {
          setTotal(res.meta.total ?? 0);
          setTotalPages(res.meta.totalPages ?? 1);
        }
      } catch (err: any) {
        console.error("Failed to load subjects:", err);
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, deptFilter, statusFilter, page, limit]
  );

  // Initial load
  useEffect(() => {
    loadStats();
    loadReferenceData();
  }, [loadStats, loadReferenceData]);

  // Debounce search
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadSubjects(false);
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
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  // Trigger search reload when debouncedSearch or filters change
  useEffect(() => {
    if (!isInitialMount.current) {
      loadSubjects(true);
    }
  }, [debouncedSearch, deptFilter, statusFilter, page, limit, loadSubjects]);

  // Fetch next available subject code for department
  const fetchNextCode = async (deptId: string) => {
    if (!deptId) return;
    try {
      setAutoGeneratingCode(true);
      const res = await getNextSubjectCodeApi(deptId);
      setSubjectCode(res.nextCode);
    } catch (err) {
      console.error("Failed to autogenerate subject code:", err);
    } finally {
      setAutoGeneratingCode(false);
    }
  };

  // Handle open create modal with autogenerated code
  const handleOpenCreate = () => {
    setEditingSubject(null);
    setSubjectName("");
    const defaultDeptId = departments.length > 0 ? departments[0]!.id : "";
    setSubjectDeptId(defaultDeptId);
    setSubjectActive(true);
    setModalError(null);
    setIsModalOpen(true);
    if (defaultDeptId) {
      fetchNextCode(defaultDeptId);
    } else {
      setSubjectCode("");
    }
  };

  // Handle department change in form
  const handleDepartmentChange = (deptId: string) => {
    setSubjectDeptId(deptId);
    if (!editingSubject) {
      fetchNextCode(deptId);
    }
  };

  // Handle open edit modal
  const handleOpenEdit = (sub: SubjectItem) => {
    setEditingSubject(sub);
    setSubjectCode(sub.code);
    setSubjectName(sub.name);
    setSubjectDeptId(sub.departmentId);
    setSubjectActive(sub.active);
    setModalError(null);
    setIsModalOpen(true);
  };

  // Submit Subject Form
  const handleSubmitSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectCode.trim() || !subjectName.trim() || !subjectDeptId) {
      setModalError("Subject code, name, and department are required.");
      return;
    }

    // Duplicate subject name check in same department (client-side)
    const duplicate = subjects.find(
      (s) =>
        s.departmentId === subjectDeptId &&
        s.name.trim().toLowerCase() === subjectName.trim().toLowerCase() &&
        (!editingSubject || s.id !== editingSubject.id)
    );
    if (duplicate) {
      setModalError(
        `A subject named "${duplicate.name}" (${duplicate.code}) already exists in this department. Duplicate subjects within the same department are not allowed.`
      );
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      if (editingSubject) {
        await updateSubjectApi(editingSubject.id, {
          code: subjectCode.trim().toUpperCase(),
          name: subjectName.trim(),
          departmentId: subjectDeptId,
          active: subjectActive,
        });
        setActionSuccess(`Subject "${subjectName}" updated successfully.`);
      } else {
        await createSubjectApi({
          code: subjectCode.trim().toUpperCase(),
          name: subjectName.trim(),
          departmentId: subjectDeptId,
        });
        setActionSuccess(`Subject "${subjectName}" created successfully.`);
      }

      setIsModalOpen(false);
      loadSubjects(false);
      loadStats();

      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setModalError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to save subject. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete subject
  const handleDeleteSubject = async () => {
    if (!deletingSubject) return;
    setSubmitting(true);
    try {
      await deleteSubjectApi(deletingSubject.id);
      setActionSuccess(`Subject "${deletingSubject.name}" deleted.`);
      setDeletingSubject(null);
      loadSubjects(false);
      loadStats();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      alert(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to delete subject."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400/80 hover:text-emerald-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Subjects</p>
              <p className="text-xl font-bold mt-1 text-foreground">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline text-primary" /> : stats.total}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Curriculum</p>
              <p className="text-xl font-bold mt-1 text-emerald-500">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : stats.active}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Archived / Inactive</p>
              <p className="text-xl font-bold mt-1 text-slate-400">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : stats.inactive}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-slate-500/10 flex items-center justify-center text-slate-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-none overflow-hidden">
        {/* Header & Filter Controls */}
        <div className="p-4 border-b border-border space-y-3">
          {/* Row 1: Title and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-foreground">
                  Institutional Subjects
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  Manage academic curriculum courses, subject codes, and departmental ownership
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  loadSubjects(false);
                  loadStats();
                }}
                className="h-7 px-2.5 text-xs border border-border rounded-md hover:bg-muted/50 text-foreground transition-colors flex items-center gap-1.5"
                title="Refresh table"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleOpenCreate}
                className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subject</span>
              </button>
            </div>
          </div>

          {/* Row 2: Search and Department Filters */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search code or title..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-7 w-full pl-8 pr-7 text-xs bg-muted/40 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto min-h-[220px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-2 px-3 font-medium">Subject Code</th>
                <th className="py-2 px-3 font-medium">Subject Name</th>
                <th className="py-2 px-3 font-medium">Department</th>
                <th className="py-2 px-3 font-medium text-center">Status</th>
                <th className="py-2 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    <td className="py-3 px-3"><div className="h-4 w-16 bg-muted rounded" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-40 bg-muted rounded" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-28 bg-muted rounded" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 w-12 bg-muted rounded mx-auto" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-4 w-14 bg-muted rounded ml-auto" /></td>
                  </tr>
                ))
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-medium">No subjects found</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {debouncedSearch
                        ? `No subjects match query "${debouncedSearch}"`
                        : "Click 'Add Subject' above to create a new curriculum course"}
                    </p>
                  </td>
                </tr>
              ) : (
                subjects.map((sub) => (
                  <tr key={sub.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium text-foreground">
                      {sub.code}
                    </td>
                    <td className="py-2 px-3 text-foreground font-medium">
                      {sub.name}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-primary/70 shrink-0" />
                        <span>{sub.department.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({sub.department.code})
                        </span>
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                          sub.active
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}
                      >
                        {sub.active ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            <span>Inactive</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(sub)}
                          className="h-6 w-6 rounded border border-border hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit subject"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeletingSubject(sub)}
                          className="h-6 w-6 rounded border border-border hover:bg-rose-500/10 hover:border-rose-500/30 flex items-center justify-center text-muted-foreground hover:text-rose-400 transition-colors"
                          title="Delete subject"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Compact Pagination */}
        <div className="p-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-6 px-1.5 text-xs bg-muted/40 border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="ml-2">
              Showing {total > 0 ? (page - 1) * limit + 1 : 0} -{" "}
              {Math.min(page * limit, total)} of {total}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-6 px-2 border border-border rounded hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-foreground">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-6 px-2 border border-border rounded hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Create or Edit Subject */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {editingSubject ? "Edit Subject" : "Create New Subject"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitSubject} className="p-4 space-y-3.5 text-xs">
              {modalError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-md flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Department (First so user selects department to drive the code) */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Department</label>
                <select
                  value={subjectDeptId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full h-8 px-2.5 bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="" disabled>
                    Select Department
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Code (Autogenerated based on department) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <span>Subject Code</span>
                    {!editingSubject && (
                      <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-mono">
                        Auto-generated ({departments.find((d) => d.id === subjectDeptId)?.code || "Dept"})
                      </span>
                    )}
                  </label>
                  {!editingSubject && subjectDeptId && (
                    <button
                      type="button"
                      onClick={() => fetchNextCode(subjectDeptId)}
                      disabled={autoGeneratingCode}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 transition-colors"
                      title="Regenerate next available subject code"
                    >
                      <RefreshCw className={`w-3 h-3 ${autoGeneratingCode ? "animate-spin" : ""}`} />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. IT001, CS001"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                    className="w-full h-8 px-2.5 font-mono font-semibold uppercase bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-8"
                    required
                  />
                  {autoGeneratingCode && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary absolute right-2.5 top-2.5" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Autogenerated per department sequence (e.g. IT001, CS001). Different departments have independent numbering.
                </p>
              </div>

              {/* Subject Name */}
              <div className="space-y-1">
                <label className="text-muted-foreground font-medium">Subject Title</label>
                <input
                  type="text"
                  placeholder="e.g. Data Structures and Algorithms"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full h-8 px-2.5 bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              {/* Active Toggle (Edit only) */}
              {editingSubject && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="subjectActiveToggle"
                    checked={subjectActive}
                    onChange={(e) => setSubjectActive(e.target.checked)}
                    className="rounded border-border bg-muted/40 text-primary focus:ring-primary w-3.5 h-3.5"
                  />
                  <label htmlFor="subjectActiveToggle" className="text-muted-foreground select-none cursor-pointer">
                    Subject is active in current academic syllabus
                  </label>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-7 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingSubject ? "Save Changes" : "Create Subject"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deletingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-sm w-full shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <h3 className="font-semibold text-foreground text-sm">Delete Subject?</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Are you sure you want to remove{" "}
              <strong className="text-foreground">{deletingSubject.name}</strong> (
              <span className="font-mono">{deletingSubject.code}</span>)? If this course has existing timetable entries or attendance sessions, deletion will be blocked by foreign key invariants.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingSubject(null)}
                className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubject}
                disabled={submitting}
                className="h-7 px-3 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-md transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
