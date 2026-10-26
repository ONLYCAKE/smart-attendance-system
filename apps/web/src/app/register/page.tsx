"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { StudentRegisterSchema, StudentRegisterInput } from "@smart-attendance/shared";
import { registerStudentApi } from "@/features/auth/api";
import { ScanFace, User, Mail, Lock, Hash, CheckCircle2, AlertCircle, ArrowLeft, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const [successData, setSuccessData] = useState<{ name: string; email: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentRegisterInput>({
    resolver: zodResolver(StudentRegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      rollNumber: "",
      // Placeholder seeded cohort UUIDs (will be populated dynamically in academic module)
      departmentId: "00000000-0000-0000-0000-000000000000",
      academicYearId: "00000000-0000-0000-0000-000000000000",
      classId: "00000000-0000-0000-0000-000000000000",
    },
  });

  const onSubmit = async (data: StudentRegisterInput) => {
    setErrorMessage(null);
    try {
      const result = await registerStudentApi(data);
      setSuccessData({ name: result.name, email: result.email });
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error?.message || err.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-lg space-y-6">
        {/* Top brand */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
              <ScanFace className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight">Smart Attendance</span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Student Self-Registration</h1>
          <p className="text-xs text-muted-foreground">
            Submit your student details to register. Accounts require administrative verification before sign-in.
          </p>
        </div>

        {/* Content Box */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          {successData ? (
            <div className="space-y-4 py-4 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground">Application Received!</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Thank you, <span className="font-semibold text-foreground">{successData.name}</span>. 
                  Your account has been created with status <span className="font-semibold text-amber-600">PENDING</span>.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground max-w-sm mx-auto text-left">
                <p className="font-medium text-foreground mb-1">Next steps:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Your department administrator reviews your enrollment.</li>
                  <li>Once approved, you can log in to complete your biometric face enrollment.</li>
                </ol>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                Return to Sign In
              </Link>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Aarav Patel"
                        {...register("name")}
                        className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    {errors.name && (
                      <p className="text-destructive text-[11px]">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Roll Number</label>
                    <div className="relative">
                      <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="CS101"
                        {...register("rollNumber")}
                        className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    {errors.rollNumber && (
                      <p className="text-destructive text-[11px]">{errors.rollNumber.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="student@college.edu"
                      {...register("email")}
                      className="w-full h-9 pl-9 pr-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-destructive text-[11px]">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Password (min 8 chars)</label>
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

                {/* Hidden/Default Cohort IDs */}
                <input type="hidden" {...register("departmentId")} />
                <input type="hidden" {...register("academicYearId")} />
                <input type="hidden" {...register("classId")} />

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-9 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting Registration...</span>
                    </>
                  ) : (
                    <span>Register Student Account</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Already have an account? Sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
