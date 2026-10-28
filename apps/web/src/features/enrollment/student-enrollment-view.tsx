"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/context/AuthContext";
import { EnrollmentPanel } from "./enrollment-panel";
import { UserRole } from "@smart-attendance/shared";
import { ShieldCheck, Search, RefreshCw, UserCheck, X, ChevronRight } from "lucide-react";
import { listStudentsApi, StudentListItem } from "@/features/academic/api/students";

export function StudentEnrollmentView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryStudentId = searchParams.get("studentId");

  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<StudentListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentListItem | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  // If a student tries to access this page, redirect to their dashboard
  useEffect(() => {
    if (user && user.role === UserRole.STUDENT) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // Initial load if queryStudentId is passed
  useEffect(() => {
    if (queryStudentId) {
      setActiveTargetId(queryStudentId);
    }
  }, [queryStudentId]);

  // Search students for Teacher / Admin lookup
  const searchStudents = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await listStudentsApi({ search: query.trim(), limit: 8 });
      setSearchResults(res.data);
    } catch (err) {
      console.error("Failed to search students:", err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim()) {
        searchStudents(searchTerm);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchStudents]);

  if (!user || user.role === UserRole.STUDENT) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between border-b border-border pb-4 transition-colors duration-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Student Biometric Face Enrollment
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Authorized in-person facial calibration and descriptor enrollment for students
          </p>
        </div>
      </div>

      {/* Student Lookup / Selection for Faculty & Admin */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm transition-colors duration-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            {selectedStudent ? "Selected Student" : "Lookup Student for Enrollment"}
          </h2>
          {selectedStudent && (
            <button
              type="button"
              onClick={() => {
                setSelectedStudent(null);
                setActiveTargetId(null);
                setSearchTerm("");
              }}
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Change Student
            </button>
          )}
        </div>

        {!selectedStudent ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search student by Name, Roll Number, or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-input rounded-lg pl-9 pr-10 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition"
              />
              {searching && (
                <RefreshCw className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Live Search Results */}
            {searchResults.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border bg-background">
                {searchResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudent(s);
                      setActiveTargetId(s.id);
                      setSearchTerm("");
                      setSearchResults([]);
                    }}
                    className="w-full p-2.5 flex items-center justify-between text-left hover:bg-muted/50 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {s.rollNumber} • {s.department?.code || "No Dept"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.faceEnrollment?.status === "ACTIVE" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium">
                          Enrolled
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">
                          Not Enrolled
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchTerm.trim() && !searching && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                No active students found matching "{searchTerm}".
              </p>
            )}
          </div>
        ) : (
          <div className="p-3 bg-muted/30 border border-border rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                {selectedStudent.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{selectedStudent.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Roll No: {selectedStudent.rollNumber} • Dept: {selectedStudent.department?.name} ({selectedStudent.department?.code})
                </p>
              </div>
            </div>
            <div>
              {selectedStudent.faceEnrollment?.status === "ACTIVE" ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium">
                  Currently Enrolled
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium">
                  Ready for In-Person Enrollment
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enrollment Panel */}
      {activeTargetId ? (
        <EnrollmentPanel
          studentId={activeTargetId}
          studentName={selectedStudent ? selectedStudent.name : `Student (${activeTargetId.slice(0, 8)}...)`}
          rollNumber={selectedStudent?.rollNumber}
          isAdminView={true}
        />
      ) : (
        <div className="p-8 text-center bg-card border border-border rounded-xl shadow-sm transition-colors duration-200">
          <p className="text-xs text-muted-foreground">
            Please search and select a student above to begin in-person facial biometrics enrollment.
          </p>
        </div>
      )}
    </div>
  );
}
