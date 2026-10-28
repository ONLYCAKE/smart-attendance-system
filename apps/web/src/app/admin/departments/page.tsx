"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Plus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  GraduationCap,
  BookOpen,
  Users,
  Loader2,
  AlertCircle,
  Archive,
} from "lucide-react";
import {
  DepartmentListItem,
  DepartmentStats,
  listDepartmentsApi,
  getDepartmentStatsApi,
  createDepartmentApi,
  updateDepartmentApi,
  deleteDepartmentApi,
} from "@/features/academic/api/departments";

export default function DepartmentsPage() {
  // Stats state (isolated from filters)
  const [stats, setStats] = useState<DepartmentStats>({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // Table data state
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "true" | "false">("ALL");

  // Focus and debounce management
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Modal Dialogs state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentListItem | null>(null);
  const [deletingDept, setDeletingDept] = useState<DepartmentListItem | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 1. Fetch Stats independently (on mount and mutations only)
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getDepartmentStatsApi();
      setStats(data);
    } catch (err) {
      console.error("Failed to load department stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 2. Debounce search input (400ms delay)
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

  // 3. Load Table Data
  const loadDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDepartmentsApi({
        search: debouncedSearch || undefined,
        active: statusFilter === "ALL" ? undefined : statusFilter,
        page,
        limit,
      });
      setDepartments(res.data);
      if (res.meta) {
        setTotal(res.meta.total || 0);
        setTotalPages(res.meta.totalPages || 1);
      }
    } catch (err) {
      console.error("Failed to load departments:", err);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, limit]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // Handle open create
  const handleOpenCreate = () => {
    setFormName("");
    setFormCode("");
    setFormActive(true);
    setFormError(null);
    setIsCreateOpen(true);
  };

  // Handle open edit
  const handleOpenEdit = (dept: DepartmentListItem) => {
    setEditingDept(dept);
    setFormName(dept.name);
    setFormCode(dept.code);
    setFormActive(dept.active);
    setFormError(null);
  };

  // Submit Create
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);
    try {
      await createDepartmentApi({
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
      });
      setIsCreateOpen(false);
      setActionSuccess(`Department '${formCode.toUpperCase()}' created successfully`);
      setTimeout(() => setActionSuccess(null), 4000);
      loadDepartments();
      loadStats();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || "Failed to create department");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;
    setFormError(null);
    setFormSubmitting(true);
    try {
      await updateDepartmentApi(editingDept.id, {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        active: formActive,
      });
      setEditingDept(null);
      setActionSuccess(`Department '${editingDept.code}' updated successfully`);
      setTimeout(() => setActionSuccess(null), 4000);
      loadDepartments();
      loadStats();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || "Failed to update department");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Delete / Safe Deactivation
  const handleDeleteConfirm = async () => {
    if (!deletingDept) return;
    setFormSubmitting(true);
    try {
      await deleteDepartmentApi(deletingDept.id);
      setDeletingDept(null);
      setActionSuccess(`Department '${deletingDept.code}' deleted successfully`);
      setTimeout(() => setActionSuccess(null), 4000);
      loadDepartments();
      loadStats();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Quick toggle active status
  const handleToggleActive = async (dept: DepartmentListItem) => {
    try {
      await updateDepartmentApi(dept.id, { active: !dept.active });
      loadDepartments();
      loadStats();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || "Failed to toggle status");
    }
  };

  const startRecord = total === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="space-y-6">
      {/* 1. Stats Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Departments</p>
              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : stats.total}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Programs</p>
              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : stats.active}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Archived / Inactive</p>
              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline" /> : stats.inactive}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Archive className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cohort Links</p>
              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                {statsLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline" />
                ) : (
                  departments.reduce((acc, d) => acc + (d._count?.classes || 0), 0)
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
              <GraduationCap className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 2. Main Card */}
      <div className="rounded-xl border border-border bg-card shadow-none">
        {/* Card Header with Two-Row Layout */}
        <div className="border-b border-border px-4 py-3 space-y-2.5">
          {/* Row 1: Title and Actions */}
          <div className="flex items-center justify-between min-h-10 gap-2.5">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-bold tracking-tight text-foreground">
                  Department Management
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Configure academic faculties, departments, and curricular scopes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  loadDepartments();
                  loadStats();
                }}
                disabled={loading}
                className="h-7 px-2.5 text-xs font-medium rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={handleOpenCreate}
                className="h-7 px-2.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Department</span>
              </button>
            </div>
          </div>

          {/* Row 2: Search and Filters */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search name or code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-7 pl-8 pr-7 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring w-48"
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
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="h-7 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="ALL">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* 3. Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground font-medium">
                <th className="px-4 py-2.5 w-24">Code</th>
                <th className="px-4 py-2.5">Department Name</th>
                <th className="px-4 py-2.5 w-24 text-center">Classes</th>
                <th className="px-4 py-2.5 w-24 text-center">Subjects</th>
                <th className="px-4 py-2.5 w-24 text-center">Students</th>
                <th className="px-4 py-2.5 w-28 text-center">Status</th>
                <th className="px-4 py-2.5 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && departments.length === 0 ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-12 bg-muted rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-40 bg-muted rounded" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 w-8 bg-muted rounded mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 w-8 bg-muted rounded mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-4 w-8 bg-muted rounded mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><div className="h-5 w-16 bg-muted rounded mx-auto" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-6 w-14 bg-muted rounded ml-auto" /></td>
                  </tr>
                ))
              ) : departments.length === 0 ? (
                // Empty state
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs font-medium text-foreground">No departments found</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {debouncedSearch
                        ? `No department matching "${debouncedSearch}"`
                        : "Create your first academic department to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                // Data rows
                departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-foreground">
                      <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[11px] border border-border">
                        {dept.code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {dept.name}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <GraduationCap className="w-3 h-3" />
                        {dept._count?.classes ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <BookOpen className="w-3 h-3" />
                        {dept._count?.subjects ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {dept._count?.students ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {dept.active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleActive(dept)}
                          title={dept.active ? "Deactivate department" : "Activate department"}
                          className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                        >
                          {dept.active ? (
                            <Archive className="w-3.5 h-3.5 text-amber-600" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(dept)}
                          title="Edit department"
                          className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setDeletingDept(dept);
                            setFormError(null);
                          }}
                          title="Delete department"
                          className="h-7 w-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
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

        {/* 4. Compact Pagination Footer */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2.5 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="h-7 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>

          <div className="flex items-center gap-4">
            <span>
              {startRecord} - {endRecord} of {total}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-7 px-2 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-foreground"
              >
                Prev
              </button>
              <span className="px-2 font-medium text-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-7 px-2 rounded-md border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-foreground"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Create Department Modal Dialog */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <Building2 className="w-4 h-4 text-primary" />
                <span>Create New Department</span>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Department Code *</label>
                <input
                  type="text"
                  placeholder="e.g. MECH, CSE, ECE"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p className="text-[10px] text-muted-foreground">Unique abbreviation for academic rosters</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Department Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Mechanical Engineering"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-8 px-3 text-xs rounded-md border border-border hover:bg-muted font-medium text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {formSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Department</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Department Modal Dialog */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <Pencil className="w-4 h-4 text-primary" />
                <span>Edit Department: {editingDept.code}</span>
              </div>
              <button
                onClick={() => setEditingDept(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Department Code *</label>
                <input
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background font-mono uppercase focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Department Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-ring h-4 w-4"
                />
                <label htmlFor="activeCheck" className="text-xs font-medium text-foreground cursor-pointer">
                  Active Department (enabled for cohort registration)
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="h-8 px-3 text-xs rounded-md border border-border hover:bg-muted font-medium text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="h-8 px-4 text-xs rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {formSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Delete / Deactivate Confirmation Dialog */}
      {deletingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-destructive font-bold text-sm">
              <Trash2 className="w-4 h-4" />
              <span>Confirm Department Deletion</span>
            </div>

            <p className="text-xs text-foreground">
              Are you sure you want to permanently delete department{" "}
              <strong>
                {deletingDept.name} ({deletingDept.code})
              </strong>
              ?
            </p>

            {(deletingDept._count?.classes > 0 ||
              deletingDept._count?.subjects > 0 ||
              deletingDept._count?.students > 0) && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Active Dependencies Detected:</p>
                  <p className="text-[11px] mt-0.5">
                    This department is linked to {deletingDept._count?.classes} classes,{" "}
                    {deletingDept._count?.subjects} subjects, and {deletingDept._count?.students}{" "}
                    students. The system protects academic integrity by preventing deletion of
                    referenced departments. You can archive or deactivate it instead.
                  </p>
                </div>
              </div>
            )}

            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingDept(null)}
                className="h-8 px-3 text-xs rounded-md border border-border hover:bg-muted font-medium text-muted-foreground"
              >
                Cancel
              </button>

              {deletingDept._count?.classes === 0 &&
              deletingDept._count?.subjects === 0 &&
              deletingDept._count?.students === 0 ? (
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={formSubmitting}
                  className="h-8 px-4 text-xs rounded-md bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {formSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Delete Permanently</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleActive(deletingDept);
                    setDeletingDept(null);
                  }}
                  className="h-8 px-4 text-xs rounded-md bg-amber-600 text-white font-medium hover:bg-amber-700 flex items-center gap-1.5"
                >
                  <span>Deactivate Instead</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
