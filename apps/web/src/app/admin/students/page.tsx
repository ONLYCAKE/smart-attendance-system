"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  GraduationCap,
  ScanFace,
  Check,
  AlertCircle,
  Loader2,
  Info,
  Plus,
  Lock,
  Eye,
  EyeOff,
  Mail,
  User,
} from "lucide-react";
import {
  StudentListItem,
  StudentStats,
  listStudentsApi,
  getStudentStatsApi,
  approveStudentApi,
  createStudentApi,
  assignStudentClassApi,
} from "@/features/academic/api/students";
import {
  DepartmentListItem,
  listDepartmentsApi,
} from "@/features/academic/api/departments";
import {
  ClassItem,
  listClassesApi,
} from "@/features/academic/api/academic";

export default function StudentsDirectoryPage() {
  // Stats state (isolated from search/filters)
  const [stats, setStats] = useState<StudentStats>({
    total: 0,
    pending: 0,
    active: 0,
    inactive: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Table data state
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Reference filter options
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [classFilter, setClassFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Focus and debounce management
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  // Approval Modal & Action States
  const [approvingStudent, setApprovingStudent] = useState<StudentListItem | null>(null);
  const [allocateClassId, setAllocateClassId] = useState<string>("");
  const [inspectingStudent, setInspectingStudent] = useState<StudentListItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentDeptId, setNewStudentDeptId] = useState("");
  const [newStudentClassId, setNewStudentClassId] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("Password123!");
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Assign Class Cohort Modal State
  const [assigningClassStudent, setAssigningClassStudent] = useState<StudentListItem | null>(null);
  const [selectedCohortClassId, setSelectedCohortClassId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const handleSaveClassAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClassStudent) return;
    setAssignError(null);

    try {
      setAssignLoading(true);
      const res = await assignStudentClassApi(
        assigningClassStudent.id,
        selectedCohortClassId || null
      );
      setToastMessage({ type: "success", text: res.message });
      setAssigningClassStudent(null);
      loadStudents(false);
      loadStats();
    } catch (err: any) {
      setAssignError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to assign class cohort. Please try again."
      );
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newStudentName.trim()) {
      setCreateError("Student name is required.");
      return;
    }
    if (!newStudentEmail.trim()) {
      setCreateError("Student email is required.");
      return;
    }
    if (!newStudentDeptId) {
      setCreateError("Please select a department.");
      return;
    }

    try {
      setCreateLoading(true);
      const res = await createStudentApi({
        name: newStudentName.trim(),
        email: newStudentEmail.trim(),
        departmentId: newStudentDeptId,
        classId: newStudentClassId || undefined,
        password: newStudentPassword || "Password123!",
      });

      setToastMessage({ type: "success", text: res.message });
      setShowAddModal(false);
      setNewStudentName("");
      setNewStudentEmail("");
      setNewStudentDeptId("");
      setNewStudentClassId("");
      setNewStudentPassword("Password123!");
      setShowModalPassword(false);

      loadStudents(false);
      loadStats();
    } catch (err: any) {
      setCreateError(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to create student. Please verify all fields."
      );
    } finally {
      setCreateLoading(false);
    }
  };

  // 1. Fetch Stats independently
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getStudentStatsApi();
      setStats(data);
    } catch (err: any) {
      console.error("Failed to load student stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 2. Fetch Reference Filter Options
  const loadReferenceData = useCallback(async () => {
    try {
      const [deptRes, classRes] = await Promise.all([
        listDepartmentsApi(),
        listClassesApi({ limit: 100 }),
      ]);
      setDepartments(deptRes.data);
      setClasses(classRes.data);
    } catch (err: any) {
      console.error("Failed to load reference filter options:", err);
    }
  }, []);

  // 3. Load Students (Debounced search & filters)
  const loadStudents = useCallback(
    async (isSearchOp = false) => {
      if (!isSearchOp) setLoading(true);
      try {
        const res = await listStudentsApi({
          search: debouncedSearch || undefined,
          departmentId: deptFilter !== "ALL" ? deptFilter : undefined,
          classId: classFilter !== "ALL" ? classFilter : undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          page,
          limit,
        });
        setStudents(res.data);
        if (res.meta) {
          setTotal(res.meta.total ?? 0);
          setTotalPages(res.meta.totalPages ?? 1);
        }
      } catch (err: any) {
        console.error("Failed to load students:", err);
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, deptFilter, classFilter, statusFilter, page, limit]
  );

  // Initial load
  useEffect(() => {
    loadStats();
    loadReferenceData();
  }, [loadStats, loadReferenceData]);

  // Debounced search effect
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      loadStudents(false);
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
      loadStudents(true);
    }
  }, [debouncedSearch, deptFilter, classFilter, statusFilter, page, limit, loadStudents]);

  // Execute Student Approval
  const handleApproveConfirm = async () => {
    if (!approvingStudent) return;
    setActionLoading(true);
    try {
      const res = await approveStudentApi(approvingStudent.id, {
        classId: allocateClassId || undefined,
      });
      setToastMessage({
        type: "success",
        text: res.message || `Student ${approvingStudent.name} (${approvingStudent.rollNumber}) approved successfully.`,
      });
      setApprovingStudent(null);
      setAllocateClassId("");
      loadStudents(false);
      loadStats();
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.response?.data?.error?.message || err.message || "Failed to approve student registration.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border animate-in fade-in duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="hover:opacity-75 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats Cards (4 Column Grid) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Roster</p>
              <p className="text-xl font-bold mt-1 text-foreground">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline text-primary" /> : stats.total}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Approval</p>
              <p className="text-xl font-bold mt-1 text-amber-500">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline text-amber-500" /> : stats.pending}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active Students</p>
              <p className="text-xl font-bold mt-1 text-emerald-500">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline text-emerald-500" /> : stats.active}
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
              <p className="text-xs text-muted-foreground font-medium">Inactive / Other</p>
              <p className="text-xl font-bold mt-1 text-slate-400">
                {statsLoading ? <RefreshCw className="w-4 h-4 animate-spin inline text-slate-400" /> : stats.inactive}
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
        {/* Header with Title and Filter Controls */}
        <div className="p-4 border-b border-border space-y-3">
          {/* Row 1: Title & Refresh */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-foreground">
                  Student Directory & Registration Approvals
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  Inspect student profiles, verify cohort placements, and grant active academic registration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => {
                  loadStudents(false);
                  loadStats();
                }}
                className="h-7 px-2.5 text-xs border border-border rounded-md hover:bg-muted/50 text-foreground transition-colors flex items-center gap-1.5"
                title="Refresh directory"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => {
                  setCreateError(null);
                  setShowAddModal(true);
                }}
                className="h-7 px-2.5 text-xs bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>
            </div>
          </div>

          {/* Row 2: Search and Multi-Select Filters */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search name, roll no, or email..."
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

            {/* Class Filter */}
            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Classes & Cohorts</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} (Sem {c.semesterNumber}-{c.division})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-7 px-2.5 text-xs bg-muted/40 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Approval</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="GRADUATED">Graduated</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto min-h-[220px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-2 px-3 font-medium">Roll No</th>
                <th className="py-2 px-3 font-medium">Student Name</th>
                <th className="py-2 px-3 font-medium">Academic Cohort</th>
                <th className="py-2 px-3 font-medium">Biometric State</th>
                <th className="py-2 px-3 font-medium text-center">Registration</th>
                <th className="py-2 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse">
                    <td className="py-3 px-3"><div className="h-4 w-16 bg-muted rounded" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-36 bg-muted rounded" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-32 bg-muted rounded" /></td>
                    <td className="py-3 px-3"><div className="h-4 w-24 bg-muted rounded" /></td>
                    <td className="py-3 px-3 text-center"><div className="h-4 w-16 bg-muted rounded mx-auto" /></td>
                    <td className="py-3 px-3 text-right"><div className="h-4 w-16 bg-muted rounded ml-auto" /></td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-medium">No students found</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {debouncedSearch
                        ? `No students match query "${debouncedSearch}"`
                        : "No student records match the active filter criteria"}
                    </p>
                  </td>
                </tr>
              ) : (
                students.map((student) => {
                  const isPending = student.status === "PENDING";
                  const isConsentGranted = student.biometricConsent?.status === "GRANTED";
                  const isFaceEnrolled = student.faceEnrollment?.status === "ACTIVE";

                  return (
                    <tr key={student.id} className="hover:bg-muted/40 transition-colors">
                      {/* Roll Number */}
                      <td className="py-2 px-3 font-mono font-medium text-foreground">
                        {student.rollNumber}
                      </td>

                      {/* Name & Email */}
                      <td className="py-2 px-3">
                        <div className="font-medium text-foreground">{student.name}</div>
                        <div className="text-[10px] text-muted-foreground">{student.email}</div>
                      </td>

                      {/* Department & Class */}
                      <td className="py-2 px-3 text-muted-foreground">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <GraduationCap className="w-3 h-3 text-primary/70 shrink-0" />
                          {student.class ? (
                            <span>{student.class.label}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningClassStudent(student);
                                setSelectedCohortClassId("");
                                setAssignError(null);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                              title="Assign Class Cohort"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>Assign Class</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span>{student.department.name}</span>
                          <span className="font-mono">({student.department.code})</span>
                        </div>
                      </td>

                      {/* Biometric Status */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <ScanFace
                            className={`w-3.5 h-3.5 ${
                              isFaceEnrolled
                                ? "text-emerald-400"
                                : isConsentGranted
                                ? "text-amber-400"
                                : "text-muted-foreground/50"
                            }`}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {isFaceEnrolled
                              ? "Enrolled"
                              : isConsentGranted
                              ? "Consent Only"
                              : "Not Enrolled"}
                          </span>
                        </div>
                      </td>

                      {/* Registration Status Badge */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            isPending
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : student.status === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                          }`}
                        >
                          {isPending && <Clock className="w-2.5 h-2.5" />}
                          {student.status === "ACTIVE" && <Check className="w-2.5 h-2.5" />}
                          <span>{student.status}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Approve Action (Only for PENDING) */}
                          {isPending && (
                            <button
                              onClick={() => setApprovingStudent(student)}
                              className="h-6 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-[10px] flex items-center gap-1 transition-colors shadow-sm"
                              title="Approve student registration"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                          )}

                          {/* Assign/Change Class */}
                          <button
                            onClick={() => {
                              setAssigningClassStudent(student);
                              setSelectedCohortClassId(student.class?.id || "");
                              setAssignError(null);
                            }}
                            className="h-6 px-1.5 border border-primary/30 hover:bg-primary/10 text-primary rounded transition-colors text-[10px] flex items-center gap-1"
                            title="Assign or change academic class cohort"
                          >
                            <GraduationCap className="w-3 h-3 text-primary" />
                            <span>Class</span>
                          </button>

                          {/* Details Inspection */}
                          <button
                            onClick={() => setInspectingStudent(student)}
                            className="h-6 px-1.5 border border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground rounded transition-colors text-[10px] flex items-center gap-1"
                            title="Inspect details"
                          >
                            <Info className="w-3 h-3" />
                            <span>Details</span>
                          </button>

                          {/* Biometric Face Enrollment */}
                          <Link
                            href={`/admin/enrollment?studentId=${student.id}`}
                            className="h-6 px-1.5 border border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-400 rounded transition-colors text-[10px] flex items-center gap-1"
                            title="Capture & Enroll Face Biometrics"
                          >
                            <ScanFace className="w-3 h-3 text-indigo-400" />
                            <span>Face</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Modal: Add Student */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full shadow-xl p-5 text-xs space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Add New Student</h3>
                  <p className="text-[11px] text-muted-foreground">Admin-provisioned student account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStudent} className="space-y-3">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Full Name *</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aditya Sharma"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full h-7 pl-8 pr-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Email Address *</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. student@college.edu"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    className="w-full h-7 pl-8 pr-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Department *</label>
                <select
                  required
                  value={newStudentDeptId}
                  onChange={(e) => {
                    setNewStudentDeptId(e.target.value);
                    setNewStudentClassId("");
                  }}
                  className="w-full h-7 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select Department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Class / Cohort (Optional) */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">
                  Class Cohort <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <select
                  value={newStudentClassId}
                  onChange={(e) => setNewStudentClassId(e.target.value)}
                  className="w-full h-7 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">No Class Cohort Assigned Yet</option>
                  {classes
                    .filter((c) => !newStudentDeptId || c.departmentId === newStudentDeptId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (Sem {c.semesterNumber} - Div {c.division})
                      </option>
                    ))}
                </select>
              </div>

              {/* Initial Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Initial Temporary Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showModalPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={newStudentPassword}
                    onChange={(e) => setNewStudentPassword(e.target.value)}
                    className="w-full h-7 pl-8 pr-8 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    tabIndex={-1}
                  >
                    {showModalPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Default: <span className="font-mono">Password123!</span>. Student must reset this upon first login.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="h-7 px-3 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 text-xs shadow-sm"
                >
                  {createLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Student</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Approve Confirmation */}
      {approvingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-sm w-full shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <h3 className="font-semibold text-foreground text-sm">Approve Student Registration?</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Are you sure you want to approve academic registration for{" "}
              <strong className="text-foreground">{approvingStudent.name}</strong> (
              <span className="font-mono">{approvingStudent.rollNumber}</span>)?
            </p>
            <div className="p-2.5 rounded bg-muted/40 border border-border space-y-1.5 text-[11px]">
              <div>
                <span className="text-muted-foreground">Department: </span>
                <span className="font-medium text-foreground">{approvingStudent.department.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Class Cohort: </span>
                <span className="font-medium text-foreground">{approvingStudent.class?.label || "Pending Allocation"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email: </span>
                <span className="font-medium text-foreground">{approvingStudent.email}</span>
              </div>

              {/* Class Allocation Dropdown */}
              <div className="pt-1.5 border-t border-border/60">
                <label className="text-muted-foreground block mb-1 font-medium">
                  {approvingStudent.class ? "Reallocate Class (Optional):" : "Allocate Class Division:"}
                </label>
                <select
                  value={allocateClassId}
                  onChange={(e) => setAllocateClassId(e.target.value)}
                  className="w-full h-8 px-2 bg-background border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{approvingStudent.class ? "Keep Current Class" : "Select Class Cohort..."}</option>
                  {classes
                    .filter((c) => c.departmentId === approvingStudent.department.id)
                    .map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.label} (Sem {cls.semesterNumber}-{cls.division})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Approval activates the student account and enables attendance tracking and facial recognition check-ins.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setApprovingStudent(null);
                  setAllocateClassId("");
                }}
                className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveConfirm}
                disabled={actionLoading}
                className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Approval</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Student Details Inspection */}
      {inspectingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Student Record: {inspectingStudent.name}
                </h3>
              </div>
              <button
                onClick={() => setInspectingStudent(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded bg-muted/30 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Roll Number</span>
                  <span className="font-mono font-medium text-foreground">{inspectingStudent.rollNumber}</span>
                </div>
                <div className="p-2.5 rounded bg-muted/30 border border-border">
                  <span className="text-muted-foreground text-[10px] block">Registration Status</span>
                  <span className="font-medium text-foreground">{inspectingStudent.status}</span>
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email Address:</span>
                  <span className="font-medium text-foreground">{inspectingStudent.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="font-medium text-foreground">
                    {inspectingStudent.department.name} ({inspectingStudent.department.code})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cohort Class:</span>
                  <span className="font-medium text-foreground">
                    {inspectingStudent.class
                      ? `${inspectingStudent.class.label} (Sem ${inspectingStudent.class.semesterNumber}-${inspectingStudent.class.division})`
                      : "Pending Allocation"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Academic Year:</span>
                  <span className="font-medium text-foreground">
                    {inspectingStudent.academicYear?.label || "Pending Allocation"}
                  </span>
                </div>
              </div>

              {/* Biometric Enrollment Details */}
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1.5 text-[11px]">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <ScanFace className="w-3.5 h-3.5 text-primary" />
                  <span>Biometric Protection Status</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Consent Status:</span>
                  <span className="text-foreground">
                    {inspectingStudent.biometricConsent?.status || "NOT_PROVIDED"}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Vector Template:</span>
                  <span className="text-foreground">
                    {inspectingStudent.faceEnrollment?.status === "ACTIVE"
                      ? `Enrolled (${inspectingStudent.faceEnrollment.modelVersion})`
                      : "No active descriptor"}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingStudent(null)}
                  className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assign Class Cohort */}
      {assigningClassStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl max-w-sm w-full shadow-xl p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Assign Class Cohort</h3>
                  <p className="text-[11px] text-muted-foreground">Allocate academic class & timetable</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningClassStudent(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {assignError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{assignError}</span>
              </div>
            )}

            <div className="p-2.5 rounded-lg bg-muted/40 border border-border space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student:</span>
                <span className="font-semibold text-foreground">{assigningClassStudent.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Roll No:</span>
                <span className="font-mono text-foreground">{assigningClassStudent.rollNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="text-foreground">
                  {assigningClassStudent.department.name} ({assigningClassStudent.department.code})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Class:</span>
                <span className="text-foreground">
                  {assigningClassStudent.class?.label || "None (Pending Allocation)"}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveClassAssignment} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Select Class Cohort</label>
                <select
                  value={selectedCohortClassId}
                  onChange={(e) => setSelectedCohortClassId(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">No Class Assigned (Pending)</option>
                  {classes
                    .filter((c) => c.departmentId === assigningClassStudent.department.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (Sem {c.semesterNumber} - Div {c.division})
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setAssigningClassStudent(null)}
                  className="h-7 px-3 border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignLoading}
                  className="h-7 px-3 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 text-xs shadow-sm"
                >
                  {assignLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Assignment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
