"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Camera,
  FileText,
  Lock,
  UserCheck,
} from "lucide-react";
import { EnrollmentStatusData, EnrollmentStep } from "./types";
import {
  getEnrollmentStatusApi,
  recordConsentApi,
  enrollFaceApi,
  deleteEnrollmentApi,
} from "./api";
import { ConsentTermsModal } from "./consent-modal";
import { CameraCapture } from "./camera-capture";
import { useAuth } from "@/features/auth/context/AuthContext";

interface EnrollmentPanelProps {
  studentId: string;
  studentName?: string;
  rollNumber?: string;
  isAdminView?: boolean;
}

export function EnrollmentPanel({
  studentId,
  studentName,
  rollNumber,
  isAdminView = false,
}: EnrollmentPanelProps) {
  const { refreshUser } = useAuth();
  const [statusData, setStatusData] = useState<EnrollmentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [activeStep, setActiveStep] = useState<EnrollmentStep>("STATUS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getEnrollmentStatusApi(studentId);
      setStatusData(data);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Failed to load enrollment status";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      fetchStatus();
    }
  }, [studentId, fetchStatus]);

  // Handle Consent Acceptance
  const handleConsentAgreed = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await recordConsentApi(
        studentId,
        true,
        "1.0",
        undefined,
        isAdminView
          ? {
              legalBasis: "IN_PERSON_INSTITUTIONAL_ONBOARDING",
              documentReference: "COLLEGE_ATTENDANCE_POLICY_2025-2026",
            }
          : undefined
      );
      setSuccessMessage("Informed consent recorded. Proceeding to camera capture.");
      await fetchStatus();
      setActiveStep("CAMERA");
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Failed to record consent";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Vector Submission
  const handleDescriptorExtracted = async (descriptor: number[]) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await enrollFaceApi(studentId, descriptor, "faceres-v1", "human");
      setSuccessMessage("Facial embeddings successfully encrypted and registered!");
      await fetchStatus();
      await refreshUser();
      setActiveStep("STATUS");
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Face enrollment failed";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Deletion
  const handleDeleteEnrollment = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      await deleteEnrollmentApi(studentId);
      setShowDeleteConfirm(false);
      setSuccessMessage("Biometric descriptors permanently purged and consent revoked.");
      await fetchStatus();
      await refreshUser();
      setActiveStep("STATUS");
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Failed to delete biometric data";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-sm transition-colors duration-200">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading student biometric profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Identity Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {studentName ? studentName : "Student Face Enrollment"}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {rollNumber && <span>Roll No: {rollNumber}</span>}
              {isAdminView && <span className="text-amber-600 dark:text-amber-400 font-medium">(Admin Override)</span>}
              <span>•</span>
              <span className="font-mono text-[11px]">ID: {studentId}</span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {statusData?.isEnrolled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Enrolled (Active)
            </span>
          ) : statusData?.hasConsent ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5" />
              Consent Granted (Awaiting Camera)
            </span>
          ) : statusData?.consentStatus === "REVOKED" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20">
              <AlertTriangle className="w-3.5 h-3.5" />
              Consent Revoked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              Not Enrolled
            </span>
          )}
        </div>
      </div>

      {/* Safety & Architecture Notice */}
      <div className="bg-indigo-50/60 dark:bg-slate-900/60 border border-indigo-100/80 dark:border-slate-800 p-3 rounded-lg text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5 transition-colors duration-200">
        <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-800 dark:text-slate-300">Biometric Privacy Guard:</strong> Facial embeddings are encrypted using
          AES-256-GCM at rest. No raw photos or camera frames are ever persisted. Facial matching is an identity-assistance
          tool and does not replace attendance oversight.
        </div>
      </div>

      {/* Error / Success Notifications */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200">
            ×
          </button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-200">
            ×
          </button>
        </div>
      )}

      {/* Step Router */}
      {activeStep === "CONSENT" && (
        <ConsentTermsModal
          onConsentAgreed={handleConsentAgreed}
          onConsentDeclined={() => setActiveStep("STATUS")}
          isSubmitting={isSubmitting}
        />
      )}

      {activeStep === "CAMERA" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xl space-y-4 transition-colors duration-200">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Facial Biometric Calibration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Position your head naturally in front of the webcam</p>
            </div>
            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-500/20">
              Provider: human/faceres-v1
            </span>
          </div>

          <CameraCapture
            onDescriptorExtracted={handleDescriptorExtracted}
            onCancel={() => setActiveStep("STATUS")}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {activeStep === "STATUS" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-sm transition-colors duration-200">
          {/* Enrolled View */}
          {statusData?.isEnrolled ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Provider & Model</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mt-1">
                    {statusData.provider} / {statusData.modelVersion}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Consent Terms</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mt-1">
                    Version {statusData.consentVersion || "1.0"}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Consented At</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mt-1">
                    {statusData.consentedAt ? new Date(statusData.consentedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors duration-200">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Enrolled At</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mt-1">
                    {statusData.enrolledAt ? new Date(statusData.enrolledAt).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Face recognition matching is active for your scheduled classroom sessions.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveStep("CAMERA")}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Re-Enroll Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800/40 transition shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Purge Biometric Data
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Not Enrolled View */
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {statusData?.consentStatus === "REVOKED"
                  ? "Biometric Enrollment is Currently Inactive"
                  : "No Face Biometric Enrolled"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Enrolling your facial embedding allows seamless, non-intrusive check-ins during attended lectures.
                Participation requires informed consent and can be revoked at any time.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep("CONSENT")}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition"
                >
                  <FileText className="w-4 h-4" />
                  Review Consent Terms & Enroll
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl transition-colors duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Permanently Purge Biometric Descriptors?</h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This will permanently delete your stored facial embeddings from the database and immediately disable automated
              facial recognition during lectures. Historical attendance records will be preserved for institutional transcripts.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
              >
                Keep Enrolled
              </button>
              <button
                type="button"
                onClick={handleDeleteEnrollment}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm transition"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Purging...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Confirm Permanent Erasure
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
