import { describe, it, expect } from "vitest";
import {
  computeCosineSimilarity,
  computeEuclideanDistance,
  evaluateCandidateMatches,
  generateSyntheticDescriptor,
  perturbDescriptor,
  runRecognitionBenchmark,
  DescriptorPayload,
} from "../src/index.js";

describe("T-030: Human.js & Biometric Recognition Technical Spike", () => {
  const dimension = 1024;

  it("computes exact cosine similarity = 1.0 and euclidean distance = 0.0 for identical vectors", () => {
    const v1 = generateSyntheticDescriptor(dimension, 42);
    const v2 = [...v1];

    const similarity = computeCosineSimilarity(v1, v2);
    const distance = computeEuclideanDistance(v1, v2);

    expect(similarity).toBeCloseTo(1.0, 5);
    expect(distance).toBeCloseTo(0.0, 5);
  });

  it("produces MATCH_FOUND when probe matches enrolled student with mild lighting perturbation", () => {
    const enrolled = generateSyntheticDescriptor(dimension, 77);
    const probe = perturbDescriptor(enrolled, 0.04); // ~4% noise simulating camera variance

    const candidates = [
      {
        studentId: "student-aarav",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: enrolled,
        },
      },
      {
        studentId: "student-other",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: generateSyntheticDescriptor(dimension, 999),
        },
      },
    ];

    const result = evaluateCandidateMatches(
      {
        provider: "human",
        modelVersion: "v1",
        dimension,
        descriptor: probe,
      },
      candidates,
      { matchThreshold: 0.82, ambiguityMargin: 0.08 }
    );

    expect(result.status).toBe("MATCH_FOUND");
    expect(result.studentId).toBe("student-aarav");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("produces NO_MATCH when probe does not match any enrolled student", () => {
    const unknownProbe = generateSyntheticDescriptor(dimension, 5555);

    const candidates = [
      {
        studentId: "student-1",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: generateSyntheticDescriptor(dimension, 1),
        },
      },
      {
        studentId: "student-2",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: generateSyntheticDescriptor(dimension, 2),
        },
      },
    ];

    const result = evaluateCandidateMatches(
      {
        provider: "human",
        modelVersion: "v1",
        dimension,
        descriptor: unknownProbe,
      },
      candidates,
      { matchThreshold: 0.82 }
    );

    expect(result.status).toBe("NO_MATCH");
    expect(result.confidence).toBeLessThan(0.82);
  });

  it("detects UNCERTAIN_MATCH when top match and runner-up are within ambiguity margin", () => {
    const base = generateSyntheticDescriptor(dimension, 888);
    // Candidate 1 has 0.05 relative noise
    const cand1 = perturbDescriptor(base, 0.05);
    // Candidate 2 has 0.06 relative noise (near-twin or ambiguous lighting)
    const cand2 = perturbDescriptor(base, 0.06);

    const candidates = [
      {
        studentId: "student-twin-1",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: cand1,
        },
      },
      {
        studentId: "student-twin-2",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension,
          descriptor: cand2,
        },
      },
    ];

    const result = evaluateCandidateMatches(
      {
        provider: "human",
        modelVersion: "v1",
        dimension,
        descriptor: base,
      },
      candidates,
      { matchThreshold: 0.82, ambiguityMargin: 0.08 }
    );

    expect(result.status).toBe("UNCERTAIN_MATCH");
    expect(result.studentId).toBeDefined();
    expect(result.runnerUpConfidence).toBeDefined();
    expect(result.ambiguityMargin).toBeLessThan(0.08);
  });

  it("enforces model and provider version gating: rejects incompatible model version", () => {
    const probe: DescriptorPayload = {
      provider: "human",
      modelVersion: "v2", // Incompatible version!
      dimension: 1024,
      descriptor: generateSyntheticDescriptor(1024, 12),
    };

    const candidates = [
      {
        studentId: "student-1",
        payload: {
          provider: "human",
          modelVersion: "v1",
          dimension: 1024,
          descriptor: generateSyntheticDescriptor(1024, 12),
        },
      },
    ];

    const result = evaluateCandidateMatches(probe, candidates);
    expect(result.status).toBe("INCOMPATIBLE_MODEL");
  });

  it("executes benchmark with low latency (< 15ms for 100-student cohort search)", () => {
    const metrics = runRecognitionBenchmark();

    expect(metrics.vectorDimension).toBe(1024);
    expect(metrics.warmComparisonLatencyUs).toBeLessThan(50); // Under 50 microseconds per 1:1 vector comparison
    expect(metrics.cohortSearchLatencyMs).toBeLessThan(15); // Under 15ms for 100 candidates
    expect(metrics.thresholds.matchThreshold).toBe(0.82);
    expect(metrics.thresholds.ambiguityMargin).toBe(0.08);
  });
});
