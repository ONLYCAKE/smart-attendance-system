"use client";

import React, { useState } from "react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { PortalLayout } from "@/features/layout";
import {
  StudentReportView,
  TeacherReportView,
  AdminSummaryView,
} from "@/features/reports";
import { Building2, GraduationCap } from "lucide-react";

export default function ReportsPage() {
  const { user } = useAuth();
  const [adminTab, setAdminTab] = useState<"summary" | "teacher">("summary");

  const role = user?.role;

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Role Routing Logic */}
        {role === "STUDENT" && <StudentReportView />}

        {role === "TEACHER" && <TeacherReportView />}

        {role === "ADMIN" && (
          <div className="space-y-6">
            {/* Admin Switcher Tabs */}
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <button
                onClick={() => setAdminTab("summary")}
                className={`h-8 px-3 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  adminTab === "summary"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Institutional Summary
              </button>
              <button
                onClick={() => setAdminTab("teacher")}
                className={`h-8 px-3 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  adminTab === "teacher"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Class Attendance Roster
              </button>
            </div>

            {adminTab === "summary" ? <AdminSummaryView /> : <TeacherReportView />}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
