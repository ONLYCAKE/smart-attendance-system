/**
 * Technical Spike: Human.js Biometric Matching Engine & Vector Analytics
 */

export interface DescriptorPayload {
  provider: string; // e.g. "human"
  modelVersion: string; // e.g. "v1"
  dimension: number;
  descriptor: number[];
}

export interface MatchEvaluationResult {
  status:
    | "MATCH_FOUND"
    | "NO_MATCH"
    | "UNCERTAIN_MATCH"
    | "INCOMPATIBLE_MODEL";
  studentId?: string;
  confidence: number;
  runnerUpConfidence?: number;
  ambiguityMargin?: number;
  reason?: string;
}

export interface SpikeBenchmarkMetrics {
  coldStartLatencyMs: number;
  warmComparisonLatencyUs: number; // microseconds
  cohortSearchLatencyMs: number; // 1-to-N cohort of 100 students
  memoryUsedMb: number;
  vectorDimension: number;
  thresholds: {
    matchThreshold: number;
    ambiguityMargin: number;
  };
}

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0 (1.0 = identical).
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Computes Euclidean distance between two vectors.
 * Returns a value >= 0 (0.0 = identical).
 */
export function computeEuclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

/**
 * Evaluates a probe descriptor against a cohort of candidate student descriptors.
 * Enforces:
 * 1. Model & Provider compatibility.
 * 2. Minimum match threshold (default: 0.82 cosine similarity).
 * 3. Ambiguity margin detection (if top match and runner up are within margin, mark as UNCERTAIN).
 */
export function evaluateCandidateMatches(
  probe: DescriptorPayload,
  candidates: Array<{ studentId: string; payload: DescriptorPayload }>,
  options: {
    matchThreshold?: number;
    ambiguityMargin?: number;
  } = {}
): MatchEvaluationResult {
  const matchThreshold = options.matchThreshold ?? 0.82;
  const ambiguityMargin = options.ambiguityMargin ?? 0.08;

  // Filter candidates matching the same provider and modelVersion
  const compatible = candidates.filter(
    (c) =>
      c.payload.provider === probe.provider &&
      c.payload.modelVersion === probe.modelVersion &&
      c.payload.dimension === probe.dimension
  );

  if (compatible.length === 0 && candidates.length > 0) {
    return {
      status: "INCOMPATIBLE_MODEL",
      confidence: 0,
      reason: "No candidate descriptors share the probe's provider and model version",
    };
  }

  if (compatible.length === 0) {
    return {
      status: "NO_MATCH",
      confidence: 0,
      reason: "No candidates enrolled in this cohort",
    };
  }

  // Calculate similarity scores for all candidates
  const scored = compatible.map((c) => ({
    studentId: c.studentId,
    confidence: computeCosineSimilarity(probe.descriptor, c.payload.descriptor),
  }));

  // Sort descending by confidence
  scored.sort((a, b) => b.confidence - a.confidence);

  const topMatch = scored[0];
  if (!topMatch) {
    return {
      status: "NO_MATCH",
      confidence: 0,
      reason: "No compatible candidates evaluated",
    };
  }
  const runnerUp = scored.length > 1 ? scored[1] : undefined;

  // Check if top match fails confidence threshold
  if (topMatch.confidence < matchThreshold) {
    return {
      status: "NO_MATCH",
      confidence: topMatch.confidence,
      reason: `Best candidate confidence (${topMatch.confidence.toFixed(3)}) fell below threshold (${matchThreshold})`,
    };
  }

  // Check ambiguity margin: if runner-up is too close to top match, flag as uncertain
  if (runnerUp) {
    const margin = topMatch.confidence - runnerUp.confidence;
    if (margin < ambiguityMargin && runnerUp.confidence >= matchThreshold - 0.05) {
      return {
        status: "UNCERTAIN_MATCH",
        studentId: topMatch.studentId,
        confidence: topMatch.confidence,
        runnerUpConfidence: runnerUp.confidence,
        ambiguityMargin: margin,
        reason: `Ambiguous match: top score (${topMatch.confidence.toFixed(3)}) is within ambiguity margin (${margin.toFixed(3)} < ${ambiguityMargin}) of runner-up (${runnerUp.confidence.toFixed(3)})`,
      };
    }
  }

  return {
    status: "MATCH_FOUND",
    studentId: topMatch.studentId,
    confidence: topMatch.confidence,
    runnerUpConfidence: runnerUp?.confidence,
  };
}

/**
 * Generates a synthetic, normalized descriptor vector of given dimension with deterministic seed.
 */
export function generateSyntheticDescriptor(dimension = 1024, seed = 1): number[] {
  const vec: number[] = new Array(dimension);
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    // Linear congruential pseudorandom generator for deterministic vectors
    const val = Math.sin(seed * 9999 + i * 37);
    vec[i] = val;
    norm += val * val;
  }
  const sqrtNorm = Math.sqrt(norm);
  for (let i = 0; i < dimension; i++) {
    vec[i] = (vec[i] ?? 0) / sqrtNorm; // L2 normalized
  }
  return vec;
}

/**
 * Creates a perturbed copy of a vector by introducing controlled relative noise.
 */
export function perturbDescriptor(vector: number[], noiseFraction = 0.05): number[] {
  const perturbed = vector.map((v, i) => v + Math.sin(i * 17) * noiseFraction * Math.abs(v));
  // Re-normalize L2
  const norm = Math.sqrt(perturbed.reduce((sum, v) => sum + v * v, 0));
  return perturbed.map((v) => v / norm);
}

/**
 * Runs a performance benchmark suite measuring latency and memory.
 */
export function runRecognitionBenchmark(): SpikeBenchmarkMetrics {
  const dimension = 1024;
  const initialMem = process.memoryUsage().heapUsed;

  // Measure cold start
  const t0 = performance.now();
  const baseVector = generateSyntheticDescriptor(dimension, 101);
  const coldStartLatencyMs = performance.now() - t0;

  // 1-to-1 repeated latency (1,000 iterations)
  const probeVector = perturbDescriptor(baseVector, 0.03);
  const iterations = 1000;
  const t1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    computeCosineSimilarity(baseVector, probeVector);
  }
  const warmComparisonLatencyUs = ((performance.now() - t1) / iterations) * 1000;

  // 1-to-N cohort search (N = 100 students)
  const cohort = Array.from({ length: 100 }, (_, i) => ({
    studentId: `student-${i}`,
    payload: {
      provider: "human",
      modelVersion: "v1",
      dimension,
      descriptor: generateSyntheticDescriptor(dimension, i + 200),
    },
  }));
  // Insert true match at index 42
  if (cohort[42]) {
    cohort[42].payload.descriptor = [...baseVector];
  }

  const t2 = performance.now();
  evaluateCandidateMatches(
    {
      provider: "human",
      modelVersion: "v1",
      dimension,
      descriptor: probeVector,
    },
    cohort
  );
  const cohortSearchLatencyMs = performance.now() - t2;

  const finalMem = process.memoryUsage().heapUsed;
  const memoryUsedMb = Math.max(0, (finalMem - initialMem) / (1024 * 1024));

  return {
    coldStartLatencyMs,
    warmComparisonLatencyUs,
    cohortSearchLatencyMs,
    memoryUsedMb,
    vectorDimension: dimension,
    thresholds: {
      matchThreshold: 0.82,
      ambiguityMargin: 0.08,
    },
  };
}
