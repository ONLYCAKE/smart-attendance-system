/**
 * Provider-independent Face Recognition Domain Abstraction
 */

export type RecognitionOutcome =
  | "MATCH_FOUND"
  | "NO_MATCH"
  | "UNCERTAIN_MATCH"
  | "NO_FACE_DETECTED"
  | "MULTIPLE_FACES_DETECTED"
  | "INVALID_IMAGE"
  | "INCOMPATIBLE_MODEL"
  | "PROVIDER_UNAVAILABLE";

export interface FaceDescriptorPayload {
  provider: string; // "human" | "compreface"
  modelVersion: string; // e.g. "v1"
  dimension: number; // e.g. 1024 or 512
  descriptor: number[];
}

export interface CandidateDescriptor {
  studentId: string;
  payload: FaceDescriptorPayload;
}

export interface RecognitionExtractionResult {
  success: boolean;
  outcome: RecognitionOutcome;
  payload?: FaceDescriptorPayload;
  faceCount?: number;
  message: string;
}

export interface RecognitionMatchResult {
  outcome: RecognitionOutcome;
  studentId?: string;
  confidence: number;
  runnerUpStudentId?: string;
  runnerUpConfidence?: number;
  ambiguityMargin?: number;
  message: string;
}

export interface MatchOptions {
  matchThreshold?: number; // Minimum cosine similarity for positive match (default 0.82)
  ambiguityMargin?: number; // Delta threshold to flag uncertain match (default 0.08)
}

export interface IFaceRecognitionProvider {
  readonly name: string;
  readonly modelVersion: string;
  readonly descriptorDimension: number;

  /**
   * Extracts a normalized face descriptor from a raw image frame.
   * Discards raw buffer immediately after processing.
   */
  extractDescriptor(imageBuffer: Buffer): Promise<RecognitionExtractionResult>;

  /**
   * Matches a probe descriptor against a scoped cohort of enrolled candidates.
   */
  matchFace(
    probe: FaceDescriptorPayload,
    candidates: CandidateDescriptor[],
    options?: MatchOptions
  ): Promise<RecognitionMatchResult>;

  /**
   * Directly compares two normalized descriptor vectors using cosine similarity.
   */
  compareDescriptors(a: number[], b: number[]): number;
}
