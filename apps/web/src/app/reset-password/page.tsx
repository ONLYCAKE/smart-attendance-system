"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/context/AuthContext";
import { firstLoginPasswordApi } from "@/features/auth/api";
import { ThemeToggle } from "@/features/theme";
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ScanFace,
} from "lucide-react";
import Link from "next/link";
import { UserRole } from "@smart-attendance/shared";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword || newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please ensure both fields are identical.");
      return;
    }

    try {
      setLoading(true);
      await firstLoginPasswordApi(newPassword);
      setSuccess(true);
      await refreshUser();

      setTimeout(() => {
        if (user?.role === UserRole.ADMIN) {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      }, 1200);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error?.message ||
          err.message ||
          "Failed to update password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-muted/20">
      <div className="absolute top-4 right-4">
        <ThemeToggle showLabel />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
              <ScanFace className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight">Smart Attendance</span>
          </Link>
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            First-Time Account Setup
          </div>
          <h1 className="text-xl font-bold tracking-tight">Set Your New Password</h1>
          <p className="text-xs text-muted-foreground">
            {user?.name ? `Welcome, ${user.name}! ` : ""}
            Please configure your permanent password to secure your account.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          {success ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Password Set Successfully!</h2>
              <p className="text-xs text-muted-foreground">
                Redirecting you to your portal dashboard...
              </p>
              <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto mt-2" />
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full h-9 pl-9 pr-10 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      tabIndex={-1}
                      title={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full h-9 pl-9 pr-10 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      tabIndex={-1}
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-md space-y-1">
                  <p className="font-medium text-foreground">Password Requirements:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Must be at least 8 characters in length</li>
                    <li>Both password fields must match exactly</li>
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-9 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving New Password...</span>
                    </>
                  ) : (
                    <span>Confirm & Proceed</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
