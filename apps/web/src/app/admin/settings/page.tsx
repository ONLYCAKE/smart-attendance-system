"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  X,
  RotateCcw,
  Save,
  Building,
  Globe,
  Sliders,
  ShieldCheck,
  BellRing,
  HelpCircle,
  Loader2,
} from "lucide-react";
import {
  SystemSettingItem,
  getSettingsApi,
  updateSettingApi,
  triggerInstitutionAlertEvaluationApi,
  EvaluateAlertsResult,
} from "@/features/settings/api";

const DEFAULT_THRESHOLD = 75.0;

export default function AdminSettingsPage() {
  // Settings state
  const [settings, setSettings] = useState<SystemSettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Threshold form state
  const [persistedThreshold, setPersistedThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [thresholdInput, setThresholdInput] = useState<string>("75");
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSaving, setThresholdSaving] = useState(false);

  // Institution Name & Timezone state
  const [institutionName, setInstitutionName] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("UTC");
  const [institutionSaving, setInstitutionSaving] = useState(false);

  // Alert & Confirmation Modals
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isReconcileConfirmOpen, setIsReconcileConfirmOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<EvaluateAlertsResult | null>(null);

  // Fetch settings from API
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettingsApi();
      setSettings(data);

      const thresholdSetting = data.find((s) => s.key === "LOW_ATTENDANCE_THRESHOLD_PERCENT");
      if (thresholdSetting) {
        const val = parseFloat(thresholdSetting.value);
        if (!isNaN(val)) {
          setPersistedThreshold(val);
          setThresholdInput(val.toString());
        }
      } else {
        setPersistedThreshold(DEFAULT_THRESHOLD);
        setThresholdInput(DEFAULT_THRESHOLD.toString());
      }

      const instNameSetting = data.find((s) => s.key === "INSTITUTION_NAME");
      if (instNameSetting) {
        setInstitutionName(instNameSetting.value);
      }

      const tzSetting = data.find((s) => s.key === "TIMEZONE");
      if (tzSetting) {
        setTimezone(tzSetting.value);
      }
    } catch (err: any) {
      console.error("Failed to load system settings:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load system settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Check for unsaved threshold changes
  const parsedInput = parseFloat(thresholdInput);
  const hasUnsavedThresholdChanges =
    !isNaN(parsedInput) && parsedInput !== persistedThreshold && !thresholdError;

  // Window beforeunload guard against accidental navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedThresholdChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedThresholdChanges]);

  // Validate threshold input
  const handleThresholdChange = (val: string) => {
    setThresholdInput(val);
    const num = parseFloat(val);
    if (val.trim() === "") {
      setThresholdError("Threshold cannot be empty");
    } else if (isNaN(num)) {
      setThresholdError("Please enter a valid numeric percentage");
    } else if (num < 1 || num > 100) {
      setThresholdError("Threshold must be between 1.0% and 100.0%");
    } else {
      setThresholdError(null);
    }
  };

  // Stepper adjustments
  const handleStep = (delta: number) => {
    const current = parseFloat(thresholdInput) || persistedThreshold;
    const nextVal = Math.min(100, Math.max(1, Math.round((current + delta) * 10) / 10));
    handleThresholdChange(nextVal.toString());
  };

  // Save Threshold Handler
  const handleSaveThreshold = async () => {
    const num = parseFloat(thresholdInput);
    if (isNaN(num) || num < 1 || num > 100) {
      setThresholdError("Threshold must be between 1.0% and 100.0%");
      return;
    }

    setThresholdSaving(true);
    setToastMessage(null);
    try {
      const updated = await updateSettingApi("LOW_ATTENDANCE_THRESHOLD_PERCENT", num.toString());
      const newNum = parseFloat(updated.value);
      setPersistedThreshold(newNum);
      setThresholdInput(newNum.toString());
      setToastMessage({
        type: "success",
        text: `Low-attendance warning threshold updated to ${newNum}%. Future evaluations will apply this policy.`,
      });
      // Refresh settings state
      await loadSettings();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || "Failed to update attendance threshold.";
      setToastMessage({ type: "error", text: msg });
    } finally {
      setThresholdSaving(false);
    }
  };

  // Reset to Default Threshold (75%)
  const handleResetToDefault = async () => {
    setIsResetConfirmOpen(false);
    setThresholdSaving(true);
    setToastMessage(null);
    try {
      const updated = await updateSettingApi(
        "LOW_ATTENDANCE_THRESHOLD_PERCENT",
        DEFAULT_THRESHOLD.toString()
      );
      const newNum = parseFloat(updated.value);
      setPersistedThreshold(newNum);
      setThresholdInput(newNum.toString());
      setThresholdError(null);
      setToastMessage({
        type: "success",
        text: `Institutional threshold reset to default ${DEFAULT_THRESHOLD}%.`,
      });
      await loadSettings();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || "Failed to reset threshold.";
      setToastMessage({ type: "error", text: msg });
    } finally {
      setThresholdSaving(false);
    }
  };

  // Save Institutional Details
  const handleSaveInstitution = async () => {
    if (!institutionName.trim()) {
      setToastMessage({ type: "error", text: "Institution name cannot be blank." });
      return;
    }

    setInstitutionSaving(true);
    try {
      await updateSettingApi("INSTITUTION_NAME", institutionName.trim());
      await updateSettingApi("TIMEZONE", timezone.trim());
      setToastMessage({
        type: "success",
        text: "Institutional details and display timezone saved successfully.",
      });
      await loadSettings();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || "Failed to save institutional details.";
      setToastMessage({ type: "error", text: msg });
    } finally {
      setInstitutionSaving(false);
    }
  };

  // Trigger Manual Alert Reconciliation
  const handleReconcileAlerts = async () => {
    setIsReconcileConfirmOpen(false);
    setReconciling(true);
    setReconcileResult(null);
    try {
      const result = await triggerInstitutionAlertEvaluationApi();
      setReconcileResult(result);
      setToastMessage({
        type: "success",
        text: `Policy reconciled: ${result.evaluated} active students evaluated. ${result.warningsCreatedOrUpdated} warning(s) flagged or updated, ${result.resolved} resolved.`,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message || "Failed to trigger alert reconciliation.";
      setToastMessage({ type: "error", text: msg });
    } finally {
      setReconciling(false);
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

      {/* Unsaved Changes Banner */}
      {hasUnsavedThresholdChanges && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Unsaved Threshold Changes:</strong> The live database policy is{" "}
              <strong>{persistedThreshold}%</strong>, while your pending draft is{" "}
              <strong>{thresholdInput}%</strong>. Save to apply this policy across future evaluations.
            </span>
          </div>
          <button
            onClick={() => {
              setThresholdInput(persistedThreshold.toString());
              setThresholdError(null);
            }}
            className="text-[11px] underline hover:opacity-80 ml-2 text-nowrap"
          >
            Discard
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between gap-2.5 min-h-14">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Institutional Settings & Attendance Policies
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure institutional attendance thresholds, warning policies, and institution metadata.
          </p>
        </div>
        <button
          onClick={loadSettings}
          disabled={loading}
          className="h-7 px-2.5 text-xs font-medium border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && settings.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="h-5 bg-muted rounded w-48 animate-pulse" />
            <div className="h-4 bg-muted rounded w-72 animate-pulse" />
            <div className="h-24 bg-muted/60 rounded-lg animate-pulse" />
          </div>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="h-5 bg-muted rounded w-48 animate-pulse" />
            <div className="h-4 bg-muted rounded w-72 animate-pulse" />
            <div className="h-24 bg-muted/60 rounded-lg animate-pulse" />
          </div>
        </div>
      ) : error ? (
        /* Error State */
        <div className="bg-card border border-rose-500/20 rounded-xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <h2 className="text-sm font-semibold text-foreground">Failed to Load Settings</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          <button
            onClick={loadSettings}
            className="h-7 px-3 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      ) : (
        /* Settings Main Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Low-Attendance Warning Threshold Card */}
          <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-sm space-y-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Low-Attendance Warning Threshold
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Minimum required attendance percentage across conducted sessions.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      persistedThreshold === DEFAULT_THRESHOLD
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    }`}
                  >
                    {persistedThreshold === DEFAULT_THRESHOLD ? "Default (75%)" : "Custom Policy"}
                  </span>
                </div>
              </div>

              {/* Threshold Overview Display */}
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">Currently Configured Policy</span>
                  <div className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
                    {persistedThreshold}%
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Students below this percentage are flagged as at-risk.
                  </span>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-lg">
                  {persistedThreshold}%
                </div>
              </div>

              {/* Threshold Editor Input */}
              <div className="space-y-2.5">
                <label className="text-xs font-medium text-foreground block">
                  Update Institutional Threshold (1.0% - 100.0%)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={0.5}
                      value={thresholdInput}
                      onChange={(e) => handleThresholdChange(e.target.value)}
                      placeholder="e.g. 75"
                      className={`w-full h-8 px-3 rounded-lg border text-xs bg-background text-foreground focus:outline-none focus:ring-1 ${
                        thresholdError
                          ? "border-rose-500 focus:ring-rose-500"
                          : "border-border focus:ring-primary"
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>

                  {/* Stepper Quick-Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStep(-5)}
                      className="h-8 px-2 text-xs border border-border rounded-lg bg-muted/40 hover:bg-muted text-foreground transition-colors"
                      title="Decrease by 5%"
                    >
                      -5%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStep(-1)}
                      className="h-8 px-2 text-xs border border-border rounded-lg bg-muted/40 hover:bg-muted text-foreground transition-colors"
                      title="Decrease by 1%"
                    >
                      -1%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStep(1)}
                      className="h-8 px-2 text-xs border border-border rounded-lg bg-muted/40 hover:bg-muted text-foreground transition-colors"
                      title="Increase by 1%"
                    >
                      +1%
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStep(5)}
                      className="h-8 px-2 text-xs border border-border rounded-lg bg-muted/40 hover:bg-muted text-foreground transition-colors"
                      title="Increase by 5%"
                    >
                      +5%
                    </button>
                  </div>
                </div>

                {thresholdError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 animate-in fade-in">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{thresholdError}</span>
                  </p>
                )}

                {/* Range Slider for visual feedback */}
                <div className="pt-2">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={!isNaN(parsedInput) ? parsedInput : 75}
                    onChange={(e) => handleThresholdChange(e.target.value)}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>1%</span>
                    <span className="font-medium text-foreground">Current: {thresholdInput || 0}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Threshold Actions */}
            <div className="pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(true)}
                disabled={thresholdSaving || persistedThreshold === DEFAULT_THRESHOLD}
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg bg-transparent hover:bg-muted/40 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default (75%)
              </button>

              <button
                type="button"
                onClick={handleSaveThreshold}
                disabled={
                  thresholdSaving ||
                  !!thresholdError ||
                  thresholdInput.trim() === "" ||
                  parsedInput === persistedThreshold
                }
                className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
              >
                {thresholdSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Threshold
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2. Institutional Information Card */}
          <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-sm space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Institutional Identity & Timezone
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Metadata displayed across student reports and official attendance exports.
                  </p>
                </div>
              </div>

              {/* Institution Name Form */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Institution Legal Name
                </label>
                <input
                  type="text"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="e.g. Apex Institute of Engineering & Technology"
                  className="w-full h-8 px-3 rounded-lg border border-border text-xs bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  Key: <code>INSTITUTION_NAME</code>
                </p>
              </div>

              {/* Timezone Configuration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Institutional Display Timezone
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full h-8 pl-8 pr-3 rounded-lg border border-border text-xs bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Key: <code>TIMEZONE</code>
                </p>
              </div>
            </div>

            {/* Institution Actions */}
            <div className="pt-3 border-t border-border flex items-center justify-end">
              <button
                type="button"
                onClick={handleSaveInstitution}
                disabled={institutionSaving || !institutionName.trim()}
                className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {institutionSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Institutional Details
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. Attendance Alert Reconciliation & Policy Specifications */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Attendance Policy & Alert Synchronization
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    How low-attendance alerts are evaluated, deduplicated, and resolved.
                  </p>
                </div>
              </div>

              {/* Manual Reconcile Button */}
              <button
                type="button"
                onClick={() => setIsReconcileConfirmOpen(true)}
                disabled={reconciling}
                className="h-7 px-2.5 text-xs font-medium border border-border rounded-lg bg-card hover:bg-muted/40 transition-colors flex items-center gap-1.5"
              >
                {reconciling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    Evaluating Policy...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-primary" />
                    Reconcile Alerts Now
                  </>
                )}
              </button>
            </div>

            {/* Reconciliation Feedback if just triggered */}
            {reconcileResult && (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/10 text-primary text-xs flex items-center justify-between">
                <span>
                  <strong>Synchronization Complete:</strong> Evaluated {reconcileResult.evaluated} active
                  students against {reconcileResult.thresholdPercent}% threshold.{" "}
                  {reconcileResult.warningsCreatedOrUpdated} alert(s) updated, {reconcileResult.resolved}{" "}
                  alert(s) automatically resolved.
                </span>
                <button
                  onClick={() => setReconcileResult(null)}
                  className="hover:opacity-75 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Policy Principles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Stable Deduplication</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Alerts use a unique compound key (<code>LOW_ATTENDANCE:OVERALL</code>) to update existing
                  unread notifications rather than flooding students with duplicate records.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                  <span>Automatic Resolution</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  When a student recovers to or above the configured threshold through subsequent attendance or
                  corrections, active alerts are automatically marked <code>RESOLVED</code>.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                  <span>Zero-Sessions Guard</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Cohorts with zero conducted sessions are safely treated as having no held classes,
                  preventing divide-by-zero errors or premature warning generation.
                </p>
              </div>
            </div>

            {/* Recurrence & Grace Period Note (Requirement Section 4) */}
            <div className="p-3 rounded-lg border border-border bg-muted/10 text-[11px] text-muted-foreground flex items-start gap-2">
              <HelpCircle className="w-4 h-4 shrink-0 text-muted-foreground/80 mt-0.5" />
              <div>
                <strong>Operational Policy Architecture:</strong> Low-attendance alerts are evaluated
                deterministically on session finalization and via the manual reconciliation trigger above.
                Notification recurrence intervals and grace periods are not defined in the current data model or API specification and are preserved for future policy customization.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Reset to Default (75%) */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-500">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Reset Attendance Threshold?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will update the institutional low-attendance warning threshold back to the default of{" "}
              <strong className="text-foreground">{DEFAULT_THRESHOLD}%</strong> and write an audit event.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="h-7 px-3 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="h-7 px-3 text-xs font-medium bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Manual Alert Reconciliation */}
      {isReconcileConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-primary">
              <div className="p-2 rounded-lg bg-primary/10">
                <BellRing className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Reconcile Attendance Alerts?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will re-evaluate every active student across all cohorts against the current{" "}
              <strong className="text-foreground">{persistedThreshold}%</strong> threshold. Alerts will be
              updated or resolved accordingly.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsReconcileConfirmOpen(false)}
                className="h-7 px-3 text-xs font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReconcileAlerts}
                className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Start Reconciliation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
