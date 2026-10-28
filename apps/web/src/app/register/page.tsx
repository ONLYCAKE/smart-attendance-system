"use client";

import Link from "next/link";
import { ScanFace, ShieldAlert, ArrowLeft, Building2 } from "lucide-react";
import { ThemeToggle } from "@/features/theme";

export default function RegisterPage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-muted/20">
      <div className="absolute top-4 right-4">
        <ThemeToggle showLabel />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Top brand */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
              <ScanFace className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight">Smart Attendance</span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Registration Policy</h1>
          <p className="text-xs text-muted-foreground">
            Institutional account provisioning policy
          </p>
        </div>

        {/* Content Box */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5 text-center">
          <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <div className="space-y-2">
            <h2 className="font-semibold text-base text-foreground">
              Self-Registration is Disabled
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Student and Faculty accounts cannot be registered publicly. All student and teacher profiles are provisioned directly by the College Administration.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-muted text-xs text-muted-foreground text-left space-y-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Building2 className="w-4 h-4 text-primary" />
              <span>How do I get my account?</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Please contact your department coordinator or college administrator. They will register your profile, allocate your roll number, and provide your initial login credentials.
            </p>
          </div>

          <Link
            href="/login"
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
