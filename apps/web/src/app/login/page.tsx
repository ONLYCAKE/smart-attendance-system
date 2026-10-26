"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, LoginInput, UserRole } from "@smart-attendance/shared";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ScanFace, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setErrorMessage(null);
    try {
      const user = await login(data);
      if (user.role === UserRole.ADMIN) {
        router.push("/admin");
      } else if (user.role === UserRole.TEACHER) {
        router.push("/teacher");
      } else {
        router.push("/student");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid email or password");
    }
  };

  const fillCredentials = (email: string) => {
    setValue("email", email);
    setValue("password", "Password@123");
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
              <ScanFace className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight">Smart Attendance</span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Sign in to your account</h1>
          <p className="text-xs text-muted-foreground">
            Enter your institutional email and password to access your portal
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Institutional Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="name@college.edu"
                  {...register("email")}
                  className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {errors.email && (
                <p className="text-destructive text-[11px]">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="••••••••"
                  {...register("password")}
                  className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {errors.password && (
                <p className="text-destructive text-[11px]">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Demo quick fill shortcuts (development only - stripped in production) */}
          {process.env.NODE_ENV === "development" && (
            <div className="pt-2 border-t border-border">
              <span className="text-[11px] text-muted-foreground font-medium block mb-2 text-center">
                Quick-fill development credentials:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => fillCredentials("admin@college.edu")}
                  className="py-1 px-2 rounded text-[11px] border border-border hover:bg-accent text-center font-medium"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials("prof.sharma@college.edu")}
                  className="py-1 px-2 rounded text-[11px] border border-border hover:bg-accent text-center font-medium"
                >
                  Teacher
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials("student.aarav@college.edu")}
                  className="py-1 px-2 rounded text-[11px] border border-border hover:bg-accent text-center font-medium"
                >
                  Student
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          New student?{" "}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
