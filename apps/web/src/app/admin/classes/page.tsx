"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  X,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  BookOpen,
  Calendar,
  Users,
  Loader2,
  AlertCircle,
  Layers,
} from "lucide-react";
import {
  ClassItem,
  AcademicYearItem,
  AcademicStats,
  listClassesApi,
  getClassStatsApi,
  createClassApi,
  updateClassApi,
  deleteClassApi,
  listAcademicYearsApi,
  createAcademicYearApi,
  createSubjectApi,
  getNextSubjectCodeApi,
} from "@/features/academic/api/academic";
import {
  DepartmentListItem,
  listDepartmentsApi,
} from "@/features/academic/api/departments";

export default function ClassesPage() {
  // Stats state (isolated from filters)
  const [stats, setStats] = useState<AcademicStats>({ total: 0, active: 0, inactive: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // Table data state
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Reference options
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearItem[]>([]);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "true" | "false">("ALL");

  // Focus and debounce management
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassItem | null>(null);

  // Class Form states
  const [classDeptId, setClassDeptId] = useState("");
  const [classYearId, setClassYearId] = useState("");
  const [classSemester, setClassSemester] = useState(1);
  const [classDivision, setClassDivision] = useState("A");
  const [classLabel, setClassLabel] = useState("");
  const [classActive, setClassActive] = useState(true);

  // Year Form states
  const [yearLabel, setYearLabel] = useState("");
  const [yearStartDate, setYearStartDate] = useState("");
  const [yearEndDate, setYearEndDate] = useState("");

  // Subject Form states
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectDeptId, setSubjectDeptId] = useState("");
  const [autoGeneratingSubjectCode, setAutoGeneratingSubjectCode] = useState(false);

  // Submissions
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 1. Fetch Stats independently
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getClassStatsApi();
      setStats(data);
    } catch (err) {
      console.error("Failed to load class stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 2. Fetch Reference Data (Departments and Academic Years)
  const loadReferenceData = useCallback(async () => {
    try {
      const [deptRes, yearsRes] = await Promise.all([
        listDepartmentsApi({ active: "true", limit: 100 }),
        listAcademicYearsApi(),
      ]);
      setDepartments(deptRes.data);
      setAcademicYears(yearsRes);
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

  // 4. Load Classes data
  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listClassesApi({
        search: debouncedSearch || undefined,
        departmentId: deptFilter !== "ALL" ? deptFilter : undefined,
        academicYearId: yearFilter !== "ALL" ? yearFilter : undefined,
        active: statusFilter !== "ALL" ? statusFilter : undefined,
        page,
        limit,
      });
      setClasses(res.data);
      setTotal(res.meta?.total || 0);
      setTotalPages(res.meta?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load classes:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, deptFilter, yearFilter, statusFilter, page, limit]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Auto-generate class label when dept, semester, division change
  useEffect(() => {
    if (isClassModalOpen && !editingClass) {
      const dept = departments.find((d) => d.id === classDeptId);
      const deptCode = dept ? dept.code : "DEPT";
      setClassLabel(`${deptCode}-Sem${classSemester}-Div${classDivision.toUpperCase()}`);
    }
  }, [classDeptId, classSemester, classDivision, departments, isClassModalOpen, editingClass]);

  // Open Create Class Modal
  const handleOpenCreateClass = () => {
    setEditingClass(null);
    setClassDeptId(departments[0]?.id || "");
    setClassYearId(academicYears[0]?.id || "");
    setClassSemester(1);
    setClassDivision("A");
    setClassLabel("");
    setClassActive(true);
    setModalError(null);
    setIsClassModalOpen(true);
  };

  // Open Edit Class Modal
  const handleOpenEditClass = (cls: ClassItem) => {
    setEditingClass(cls);
    setClassDeptId(cls.departmentId);
    setClassYearId(cls.academicYearId);
    setClassSemester(cls.semesterNumber);
    setClassDivision(cls.division);
    setClassLabel(cls.label);
    setClassActive(cls.active);
    setModalError(null);
    setIsClassModalOpen(true);
  };

  // Submit Class
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      if (editingClass) {
        await updateClassApi(editingClass.id, {
          departmentId: classDeptId,
          academicYearId: classYearId,
          semesterNumber: Number(classSemester),
          division: classDivision.trim().toUpperCase(),
          label: classLabel.trim(),
          active: classActive,
        });
        setActionSuccess(`Class '${classLabel}' updated successfully`);
      } else {
        await createClassApi({
          departmentId: classDeptId,
          academicYearId: classYearId,
          semesterNumber: Number(classSemester),
          division: classDivision.trim().toUpperCase(),
          label: classLabel.trim(),
        });
        setActionSuccess(`Class '${classLabel}' created successfully`);
      }
      setIsClassModalOpen(false);
      loadClasses();
      loadStats();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to save class");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Academic Year
  const handleSaveYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      await createAcademicYearApi({
        label: yearLabel.trim(),
        startDate: new Date(yearStartDate).toISOString(),
        endDate: new Date(yearEndDate).toISOString(),
      });
      setActionSuccess(`Academic Year '${yearLabel}' created successfully`);
      setIsYearModalOpen(false);
      setYearLabel("");
      setYearStartDate("");
      setYearEndDate("");
      loadReferenceData();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to create academic year");
    } finally {
      setSubmitting(false);
    }
  };

  // Autogenerate subject code
  const fetchNextSubjectCode = async (deptId: string) => {
    if (!deptId) return;
    try {
      setAutoGeneratingSubjectCode(true);
      const res = await getNextSubjectCodeApi(deptId);
      setSubjectCode(res.nextCode);
    } catch (err) {
      console.error("Failed to autogenerate subject code:", err);
    } finally {
      setAutoGeneratingSubjectCode(false);
    }
  };

  const handleSubjectDepartmentChange = (deptId: string) => {
    setSubjectDeptId(deptId);
    if (deptId) {
      fetchNextSubjectCode(deptId);
    } else {
      setSubjectCode("");
    }
  };

  // Submit Subject
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      const res = await createSubjectApi({
        code: subjectCode.trim().toUpperCase() || undefined,
        name: subjectName.trim(),
        departmentId: subjectDeptId,
      });
      setActionSuccess(`Subject '${res.code || subjectCode}' created successfully`);
      setIsSubjectModalOpen(false);
      setSubjectCode("");
      setSubjectName("");
      loadStats();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to create subject");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Class
  const handleDeleteClass = async () => {
    if (!deletingClass) return;
    setSubmitting(true);
    setModalError(null);

    try {
      const res = await deleteClassApi(deletingClass.id);
      setActionSuccess(res.message);
      setDeletingClass(null);
      loadClasses();
      loadStats();
    } catch (err: any) {
      setModalError(err.response?.data?.error?.message || "Failed to delete class");
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Classes</p>
              <p className="text-xl font-bold mt-0.5">
                {statsLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline text-muted-foreground" />
                ) : (
                  stats.total
                )}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Active Cohorts</p>
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
              <p className="text-xs text-muted-foreground">Inactive Cohorts</p>
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

        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Academic Years</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {academicYears.length}
              </p>
            </div>
            <div className="h-8 w-8 rounded-md bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="border-b border-border px-4 py-3 space-y-2.5">
          {/* Row 1: Title and Actions */}
          <div className="flex items-center justify-between min-h-14 gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-indigo-600" />
              <div>
                <h1 className="text-base font-semibold leading-none">Classes & Cohorts</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Manage academic years, semester divisions, and departmental cohorts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  loadClasses();
                  loadStats();
                }}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
                title="Refresh classes"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </button>
              <button
                onClick={() => {
                  setYearLabel("");
                  setYearStartDate("");
                  setYearEndDate("");
                  setModalError(null);
                  setIsYearModalOpen(true);
                }}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Add Year
              </button>
              <button
                onClick={() => {
                  setSubjectName("");
                  const defaultDeptId = departments[0]?.id || "";
                  setSubjectDeptId(defaultDeptId);
                  setModalError(null);
                  setIsSubjectModalOpen(true);
                  if (defaultDeptId) {
                    fetchNextSubjectCode(defaultDeptId);
                  } else {
                    setSubjectCode("");
                  }
                }}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-md hover:bg-muted flex items-center transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Add Subject
              </button>
              <button
                onClick={handleOpenCreateClass}
                className="h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center transition-colors"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Class
              </button>
            </div>
          </div>

          {/* Row 2: Filters */}
          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search class label..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-7 px-2.5 pl-8 pr-7 text-xs border border-border rounded-md w-44 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="h-7 px-2 text-xs border border-border rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} - {d.name}
                </option>
              ))}
            </select>

            {/* Academic Year Filter */}
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2 text-xs border border-border rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Academic Years</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
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
              className="h-7 px-2 text-xs border border-border rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Status</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Compact Table */}
        <div className="table-compact transition-opacity duration-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-secondary-foreground/80 font-normal">
                <th className="px-3 py-2 font-medium">Class / Cohort</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Academic Year</th>
                <th className="px-3 py-2 font-medium">Semester & Div</th>
                <th className="px-3 py-2 font-medium">Enrolled Students</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="min-h-[200px] divide-y divide-border">
              {loading && classes.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="animate-pulse">
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-28" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-16" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-4 bg-muted rounded w-20" />
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
              ) : classes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No classes found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {debouncedSearch
                        ? `No results match "${debouncedSearch}"`
                        : "Click 'Add Class' to create your first academic cohort"}
                    </p>
                  </td>
                </tr>
              ) : (
                classes.map((cls) => (
                  <tr key={cls.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-foreground">{cls.label}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 border border-border">
                        {cls.department?.code}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {cls.academicYear?.label}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">
                        Sem {cls.semesterNumber} - Div {cls.division}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        {cls._count?.students || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {cls.active ? (
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
                          onClick={() => handleOpenEditClass(cls)}
                          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Edit Class"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingClass(cls);
                            setModalError(null);
                          }}
                          className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Delete Class"
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

        {/* Compact Pagination */}
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

      {/* --- MODAL: CREATE / EDIT CLASS --- */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">
                  {editingClass ? "Edit Class" : "Create New Class"}
                </h3>
              </div>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="p-4 space-y-3 text-xs">
              {modalError && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Department</label>
                <select
                  required
                  value={classDeptId}
                  onChange={(e) => setClassDeptId(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Academic Year
                </label>
                <select
                  required
                  value={classYearId}
                  onChange={(e) => setClassYearId(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Academic Year</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    Semester Number (1-12)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    required
                    value={classSemester}
                    onChange={(e) => setClassSemester(Number(e.target.value))}
                    className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    Division (e.g. A, B)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    value={classDivision}
                    onChange={(e) => setClassDivision(e.target.value.toUpperCase())}
                    className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent uppercase focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Class Label
                </label>
                <input
                  type="text"
                  required
                  value={classLabel}
                  onChange={(e) => setClassLabel(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {editingClass && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="classActiveCheck"
                    checked={classActive}
                    onChange={(e) => setClassActive(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="classActiveCheck" className="text-muted-foreground">
                    Active Cohort
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-7 px-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingClass ? "Save Changes" : "Create Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: CREATE ACADEMIC YEAR --- */}
      {isYearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold">New Academic Year</h3>
              </div>
              <button
                onClick={() => setIsYearModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveYear} className="p-4 space-y-3 text-xs">
              {modalError && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  Year Label (e.g. 2026-2027)
                </label>
                <input
                  type="text"
                  required
                  placeholder="2026-2027"
                  value={yearLabel}
                  onChange={(e) => setYearLabel(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  required
                  value={yearStartDate}
                  onChange={(e) => setYearStartDate(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">End Date</label>
                <input
                  type="date"
                  required
                  value={yearEndDate}
                  onChange={(e) => setYearEndDate(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsYearModalOpen(false)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-7 px-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: CREATE SUBJECT --- */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold">New Subject</h3>
              </div>
              <button
                onClick={() => setIsSubjectModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="p-4 space-y-3.5 text-xs">
              {modalError && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Department (Selected first to drive autogenerated code) */}
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Department</label>
                <select
                  required
                  value={subjectDeptId}
                  onChange={(e) => handleSubjectDepartmentChange(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Code (Autogenerated per department) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <span>Subject Code</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono">
                      Auto-generated ({departments.find((d) => d.id === subjectDeptId)?.code || "Dept"})
                    </span>
                  </label>
                  {subjectDeptId && (
                    <button
                      type="button"
                      onClick={() => fetchNextSubjectCode(subjectDeptId)}
                      disabled={autoGeneratingSubjectCode}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 transition-colors"
                      title="Regenerate next available subject code"
                    >
                      <RefreshCw className={`w-3 h-3 ${autoGeneratingSubjectCode ? "animate-spin" : ""}`} />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="e.g. IT001, CS001"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                    className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent uppercase font-mono font-semibold focus:ring-1 focus:ring-emerald-500 pr-8"
                  />
                  {autoGeneratingSubjectCode && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 absolute right-2.5 top-2.5" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Autogenerated per department sequence (e.g. {departments.find((d) => d.id === subjectDeptId)?.code || "DEPT"}001).
                </p>
              </div>

              {/* Subject Name */}
              <div>
                <label className="block text-muted-foreground font-medium mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Signals & Systems"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="w-full h-8 px-2.5 border border-border rounded-md bg-transparent focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-7 px-3 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: DELETE CONFIRMATION --- */}
      {deletingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">Confirm Deletion</h3>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Are you sure you want to delete class{" "}
                <span className="font-semibold text-foreground">{deletingClass.label}</span>?
              </p>

              {deletingClass._count &&
                (deletingClass._count.students > 0 ||
                  deletingClass._count.teacherAssignments > 0 ||
                  deletingClass._count.timetableEntries > 0) && (
                  <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                    <p className="font-medium">Dependent records detected:</p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {deletingClass._count.students > 0 && (
                        <li>{deletingClass._count.students} enrolled students</li>
                      )}
                      {deletingClass._count.teacherAssignments > 0 && (
                        <li>{deletingClass._count.teacherAssignments} teacher assignments</li>
                      )}
                      {deletingClass._count.timetableEntries > 0 && (
                        <li>{deletingClass._count.timetableEntries} timetable entries</li>
                      )}
                    </ul>
                    <p className="mt-1.5 text-[11px]">
                      Deletion will be blocked by foreign key protection.
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
                  onClick={() => setDeletingClass(null)}
                  className="h-7 px-3 rounded-md border border-border hover:bg-muted font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDeleteClass}
                  className="h-7 px-3 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Delete Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
