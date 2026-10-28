"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, VideoOff, Users } from "lucide-react";
import { extractGenuineFaceEmbedding } from "./human-face-service";

interface CameraCaptureProps {
  onDescriptorExtracted: (descriptor: number[]) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CameraCapture({
  onDescriptorExtracted,
  onCancel,
  isSubmitting = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [detectionFeedback, setDetectionFeedback] = useState<{
    status: "IDLE" | "DETECTED" | "NO_FACE" | "POOR_LIGHTING" | "MULTIPLE_FACES" | "MODEL_ERROR";
    message: string;
  }>({
    status: "IDLE",
    message: "Position your face squarely within the oval guide under balanced lighting",
  });
  const [extractedVector, setExtractedVector] = useState<number[] | null>(null);

  // Initialize camera stream
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
          setCameraError("Camera permission denied. Please allow camera access in your browser settings to enroll.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("No video camera device detected. Please connect a working webcam.");
        } else {
          setCameraError(err.message || "Failed to initialize camera stream.");
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

  // Ensure video element plays when stream is assigned
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Capture frame and extract genuine AI 1024-float vector in-memory via Human.js
  const handleCaptureAndExtract = useCallback(async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const result = await extractGenuineFaceEmbedding(videoRef.current);

      if (result.status === "DETECTED") {
        setExtractedVector(result.descriptor);
        setDetectionFeedback({
          status: "DETECTED",
          message: result.message,
        });
      } else if (result.status === "MULTIPLE_FACES") {
        setDetectionFeedback({
          status: "MULTIPLE_FACES",
          message: result.message,
        });
      } else if (result.status === "POOR_QUALITY") {
        setDetectionFeedback({
          status: "POOR_LIGHTING",
          message: result.message,
        });
      } else if (result.status === "MODEL_ERROR") {
        setDetectionFeedback({
          status: "MODEL_ERROR",
          message: result.message,
        });
      } else {
        setDetectionFeedback({
          status: "NO_FACE",
          message: result.message,
        });
      }
    } catch (err: any) {
      setDetectionFeedback({
        status: "NO_FACE",
        message: err.message || "Face detection failed. Ensure face is centered and retry.",
      });
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleRetake = () => {
    setExtractedVector(null);
    setDetectionFeedback({
      status: "IDLE",
      message: "Position your face squarely within the oval guide under balanced lighting",
    });
  };

  const handleSubmit = () => {
    if (extractedVector) {
      onDescriptorExtracted(extractedVector);
    }
  };

  return (
    <div className="space-y-4">
      {/* Video Viewport / Capture Box */}
      <div className="relative w-full max-w-md mx-auto aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-inner flex items-center justify-center">
        {cameraError ? (
          <div className="p-6 text-center text-slate-700 dark:text-slate-300 space-y-3">
            <VideoOff className="w-10 h-10 text-red-500 dark:text-red-400 mx-auto" />
            <p className="text-sm font-medium text-red-600 dark:text-red-300">{cameraError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md border border-slate-300 dark:border-slate-600 transition shadow-sm"
            >
              Retry Permission
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />

            {/* Face Alignment Oval Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className={`w-48 h-64 border-2 rounded-[50%] transition-colors duration-300 ${
                  detectionFeedback.status === "DETECTED"
                    ? "border-emerald-400 bg-emerald-500/10"
                    : detectionFeedback.status === "POOR_LIGHTING"
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-cyan-400/70 border-dashed"
                }`}
              />
            </div>

            {/* Live Status Overlay */}
            <div className="absolute bottom-2 left-2 right-2 bg-slate-950/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Camera Active
              </span>
              <span className="text-slate-400">Zero Raw Images Saved</span>
            </div>
          </>
        )}
      </div>

      {/* Detection Feedback Alert */}
      <div
        className={`p-3 rounded-lg text-xs flex items-start gap-2.5 transition-colors border ${
          detectionFeedback.status === "DETECTED"
            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
            : detectionFeedback.status === "POOR_LIGHTING" || detectionFeedback.status === "MULTIPLE_FACES"
            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
            : detectionFeedback.status === "NO_FACE" || detectionFeedback.status === "MODEL_ERROR"
            ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/60"
            : "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60"
        }`}
      >
        {detectionFeedback.status === "DETECTED" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
        ) : detectionFeedback.status === "MULTIPLE_FACES" ? (
          <Users className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
        ) : detectionFeedback.status === "POOR_LIGHTING" ? (
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
        ) : detectionFeedback.status === "NO_FACE" || detectionFeedback.status === "MODEL_ERROR" ? (
          <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-medium">{detectionFeedback.message}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Face embeddings are computed directly in memory using Human.js MobileFaceNet. Raw images are never saved, transmitted, or logged.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
        >
          Cancel
        </button>

        {!extractedVector ? (
          <button
            type="button"
            onClick={handleCaptureAndExtract}
            disabled={Boolean(cameraError) || isCapturing}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            {isCapturing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Analyzing Frame...
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                Capture & Extract Vector
              </>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRetake}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retake Frame
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Encrypting & Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm & Complete Enrollment
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
