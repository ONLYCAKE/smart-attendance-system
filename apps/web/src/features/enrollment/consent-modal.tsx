"use client";

import React, { useState } from "react";
import { ShieldCheck, Check } from "lucide-react";

interface ConsentTermsModalProps {
  onConsentAgreed: () => void;
  onConsentDeclined: () => void;
  isSubmitting?: boolean;
}

export function ConsentTermsModal({
  onConsentAgreed,
  onConsentDeclined,
  isSubmitting = false,
}: ConsentTermsModalProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xl transition-colors duration-200">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Biometric Data Collection & Processing Consent
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Policy Version 1.0 — Effective Academic Year 2025–2026</p>
        </div>
      </div>

      <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto leading-relaxed">
        <p className="font-medium text-slate-900 dark:text-slate-200">
          Please review the following biometric data processing terms carefully before proceeding with enrollment:
        </p>

        <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400 pl-1">
          <li>
            <strong className="text-slate-900 dark:text-slate-200">Purpose Limitation:</strong> Face embeddings are generated and utilized
            exclusively for recording student attendance during active, scheduled lecture sessions authorized by the institution.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-200">Zero Raw Image Retention:</strong> No photos, camera frames, or video
            recordings are ever stored, logged, or transmitted to backend servers. Camera frames are processed in-memory
            on your device to extract a normalized 1024-float embedding vector and immediately discarded.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-200">Encryption at Rest:</strong> Enrolled descriptor vectors are stored using
            authenticated AES-256-GCM encryption with strict model version isolation (<code className="text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded font-mono">human/v1</code>).
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-200">Identity-Assistance Disclaimer:</strong> Facial matching is an identity-assistance
            tool designed to expedite lecture check-in. It is not an unattended security checkpoint or proof of liveness.
            Class teachers always retain manual override and verification authority.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-slate-200">Right to Revocation & Erasure:</strong> You maintain the unconditional right to
            revoke consent or permanently delete your biometric embeddings at any time through this portal. Deletion immediately
            disables automated recognition without affecting existing attendance history.
          </li>
        </ul>
      </div>

      <div className="flex items-start gap-2.5 pt-1">
        <input
          type="checkbox"
          id="consent-checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-white dark:focus:ring-offset-slate-900 h-4 w-4"
        />
        <label htmlFor="consent-checkbox" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          I have read and voluntarily agree to the biometric data collection terms. I understand that my participation is
          consensual and can be revoked at any time.
        </label>
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={onConsentDeclined}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
        >
          Decline & Exit
        </button>
        <button
          type="button"
          onClick={onConsentAgreed}
          disabled={!agreed || isSubmitting}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {isSubmitting ? "Recording Consent..." : "Accept & Continue to Camera"}
        </button>
      </div>
    </div>
  );
}
