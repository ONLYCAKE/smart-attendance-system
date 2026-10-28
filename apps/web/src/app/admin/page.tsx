"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, GraduationCap, BookOpen, Users, ArrowRight } from "lucide-react";
import { getDepartmentStatsApi, DepartmentStats } from "@/features/academic/api/departments";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DepartmentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDepartmentStatsApi()
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      title: "Departments",
      count: stats?.total ?? "...",
      subtitle: `${stats?.active ?? "..."} active departments`,
      icon: Building2,
      href: "/admin/departments",
      color: "text-blue-600 bg-blue-500/10",
    },
    {
      title: "Academic Cohorts",
      count: "Classes",
      subtitle: "Active division rosters",
      icon: GraduationCap,
      href: "/admin/classes",
      color: "text-emerald-600 bg-emerald-500/10",
    },
    {
      title: "Subjects & Syllabus",
      count: "Curriculum",
      subtitle: "Subject-teacher allocations",
      icon: BookOpen,
      href: "/admin/subjects",
      color: "text-purple-600 bg-purple-500/10",
    },
    {
      title: "Student Directory",
      count: "Directory",
      subtitle: "Enrollments and approvals",
      icon: Users,
      href: "/admin/students",
      color: "text-amber-600 bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Academic Administration Dashboard
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage institutional departments, cohorts, curriculum, and timetable schedules.
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.href}
              className="p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{c.title}</span>
                <div className={`p-2 rounded-lg ${c.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-foreground tracking-tight">
                  {loading ? "..." : c.count}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-between">
                  <span>{c.subtitle}</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
