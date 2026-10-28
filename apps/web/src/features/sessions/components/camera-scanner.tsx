"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  VideoOff,
  UserCheck,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { recognizeFaceApi, confirmRecognitionApi } from "../api";
import { RecognitionScanResult } from "../types";
import { extractGenuineFaceEmbedding } from "@/features/enrollment/human-face-service";

interface CameraScannerProps {
  sessionId: string;
  onAttendanceUpdated: () => void;
  onClose: () => void;
}

export function CameraScanner({
  sessionId,
  onAttendanceUpdated,
  onClose,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<RecognitionScanResult | null>(null);
  const [clientDetectionError, setClientDetectionError] = useState<string | null>(null);

  // Initialize camera stream and release on unmount
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function initCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API is not supported in this browser environment");
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraError("Camera permission denied. Please allow camera access in browser settings.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("No webcam device found. Please connect a camera.");
        } else {
          setCameraError(err.message || "Failed to initialize camera.");
        }
      }
    }

    initCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Client-side genuine AI face embedding extraction and server-side matching
  const handleCaptureAndRecognize = useCallback(async () => {
    if (!videoRef.current || isProcessing) return;
    setIsProcessing(true);
    setScanResult(null);
    setClientDetectionError(null);

    try {
      // 1. Extract genuine 1024-float embedding using client-side Human.js neural network
      const extraction = await extractGenuineFaceEmbedding(videoRef.current);

      if (extraction.status !== "DETECTED") {
        setClientDetectionError(extraction.message);
        setIsProcessing(false);
        return;
      }

      // 2. Transmit untrusted normalized embedding to server for cohort matching
      const result = await recognizeFaceApi(sessionId, {
        descriptor: extraction.descriptor,
        provider: "human",
        modelVersion: "faceres-v1",
      });

      setScanResult(result);
      if (result.recorded) {
        onAttendanceUpdated();
      }
    } catch (err: any) {
      setClientDetectionError(err.response?.data?.error?.message || err.message || "Recognition failed");
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, isProcessing, onAttendanceUpdated]);

  // Teacher confirmation of candidate
  const handleConfirmCandidate = async (studentId: string, confidence: number) => {
    setIsProcessing(true);
    try {
      await confirmRecognitionApi(sessionId, {
        studentId,
        confidence,
        status: "PRESENT",
        teacherConfirmed: true,
      });
      onAttendanceUpdated();
      setScanResult((prev) => (prev ? { ...prev, recorded: true, requiresTeacherConfirmation: false } : null));
    } catch (err: any) {
      setClientDetectionError(err.response?.data?.error?.message || err.message || "Failed to confirm attendance");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
              <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Face Recognition Scanner
              </h2>
              <p className="text-xs text-zinc-500">
                Class cohort biometric matching (Human.js MobileFaceNet / faceres-v1)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {cameraError ? (
            <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-center space-y-2">
              <VideoOff className="w-8 h-8 text-red-500 mx-auto" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Camera Unavailable
              </p>
              <p className="text-xs text-red-600 dark:text-red-300">{cameraError}</p>
            </div>
          ) : (
            <div className="relative aspect-video bg-zinc-950 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />

              {/* Facial alignment oval guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-44 h-60 rounded-[50%] border-2 transition-colors duration-300 ${
                    scanResult?.recorded
                      ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                      : scanResult?.outcome === "UNCERTAIN_MATCH"
                      ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                      : scanResult?.outcome === "NO_MATCH"
                      ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                      : "border-indigo-400/80 shadow-[0_0_15px_rgba(99,102,241,0.3)] animate-pulse"
                  }`}
                />
              </div>

              {/* Status pill overlay */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] text-white flex items-center gap-1.5 border border-white/10">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Live Camera Feed
              </div>

              {/* Supervised recognition mode badge */}
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-white flex items-center gap-1.5 border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Supervised • Confirmation Required</span>
              </div>
            </div>
          )}

          {/* Client detection feedback error */}
          {clientDetectionError && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{clientDetectionError}</span>
            </div>
          )}

          {/* Scan Results Display */}
          {scanResult && (
            <div className="space-y-3">
              {/* Confident Match & Automatically Recorded */}
              {scanResult.recorded && scanResult.candidate && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-900 dark:text-emerald-100 text-sm">
                          {scanResult.candidate.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                          {scanResult.candidate.rollNumber}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        Attendance recorded: <strong>PRESENT</strong> ({((scanResult.confidence ?? 0) * 100).toFixed(1)}% match)
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white">
                    Confirmed
                  </span>
                </div>
              )}

              {/* Confident Match Requiring Teacher Review */}
              {!scanResult.recorded && scanResult.outcome === "MATCH_FOUND" && scanResult.candidate && (
                <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-900 dark:text-indigo-100 text-sm">
                          {scanResult.candidate.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200">
                          {scanResult.candidate.rollNumber}
                        </span>
                      </div>
                      <p className="text-xs text-indigo-700 dark:text-indigo-300">
                        Confidence: {((scanResult.confidence ?? 0) * 100).toFixed(1)}% • Awaiting teacher confirmation
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleConfirmCandidate(scanResult.candidate!.id, scanResult.confidence ?? 0.85)}
                    disabled={isProcessing}
                    className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 flex items-center gap-1.5"
                  >
                    Confirm Attendance
                  </button>
                </div>
              )}

              {/* Already Marked */}
              {scanResult.isAlreadyMarked && scanResult.candidate && (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                          {scanResult.candidate.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                          {scanResult.candidate.rollNumber}
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        {scanResult.message}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    Already Marked
                  </span>
                </div>
              )}

              {/* Uncertain / Ambiguous Match */}
              {scanResult.outcome === "UNCERTAIN_MATCH" && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Ambiguous Facial Match — Teacher Review Required</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The top match and runner-up are too close (ambiguity margin &lt; 0.08). Select the correct student to confirm:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {scanResult.candidate && (
                      <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {scanResult.candidate.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {scanResult.candidate.rollNumber} • {((scanResult.confidence ?? 0) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <button
                          onClick={() => handleConfirmCandidate(scanResult.candidate!.id, scanResult.confidence ?? 0.8)}
                          disabled={isProcessing}
                          className="h-7 px-2.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium"
                        >
                          Confirm
                        </button>
                      </div>
                    )}

                    {scanResult.runnerUp && (
                      <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-800 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {scanResult.runnerUp.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {scanResult.runnerUp.rollNumber} • {((scanResult.runnerUpConfidence ?? 0) * 100).toFixed(1)}%
                          </p>
                        </div>
                        <button
                          onClick={() => handleConfirmCandidate(scanResult.runnerUp!.id, scanResult.runnerUpConfidence ?? 0.8)}
                          disabled={isProcessing}
                          className="h-7 px-2.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium"
                        >
                          Confirm
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No Match / Unknown Student */}
              {scanResult.outcome === "NO_MATCH" && (
                <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                    <UserX className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      No Cohort Match Found
                    </p>
                    <p className="text-xs text-zinc-500">
                      {scanResult.message}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="h-8 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Close Scanner
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCaptureAndRecognize}
              disabled={isProcessing || Boolean(cameraError)}
              className="h-8 px-4 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Matching Face...
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" />
                  Capture & Match Face
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
