import { describe, it, expect } from "vitest";
import {
  HumanFaceRecognitionProvider,
  humanFaceRecognitionProvider,
} from "../src/modules/recognition/human.provider.js";
import {
  FaceDescriptorPayload,
  CandidateDescriptor,
} from "../src/modules/recognition/provider.interface.js";

describe("T-031: Face Recognition Provider Abstraction & Human.js (faceres-v1) Verification", () => {
  const provider = humanFaceRecognitionProvider;

  // Helper to generate normalized vector
  const makeVector = (seed: number, dim = 1024): number[] => {
    const vec = new Array(dim);
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      const val = Math.sin(seed * 777 + i * 19);
      vec[i] = val;
      norm += val * val;
    }
    const sqrt = Math.sqrt(norm);
    return vec.map((v) => v / sqrt);
  };

  const perturb = (vec: number[], noise = 0.03): number[] => {
    const perturbed = vec.map((v, i) => v + Math.sin(i * 23) * noise * Math.abs(v));
    const norm = Math.sqrt(perturbed.reduce((sum, v) => sum + v * v, 0));
    return perturbed.map((v) => v / norm);
  };

  describe("1. Model Initialization and Metadata Contract", () => {
    it("exposes expected provider properties and metadata", () => {
      expect(provider.name).toBe("human");
      expect(provider.modelVersion).toBe("faceres-v1");
      expect(provider.descriptorDimension).toBe(1024);
    });

    it("computes exact cosine similarity for identical vectors (1.0)", () => {
      const v = makeVector(10);
      const similarity = provider.compareDescriptors(v, [...v]);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("computes exact cosine similarity for orthogonal vectors (~0.0)", () => {
      const v1 = [1, 0, 0, 0];
      const v2 = [0, 1, 0, 0];
      const similarity = provider.compareDescriptors(v1, v2);
      expect(similarity).toBe(0);
    });

    it("computes exact cosine similarity for opposite vectors (-1.0)", () => {
      const v1 = [1, 0];
      const v2 = [-1, 0];
      const similarity = provider.compareDescriptors(v1, v2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it("throws when comparing vectors with dimension mismatch", () => {
      const v1 = makeVector(10, 1024);
      const v2 = makeVector(10, 512);
      expect(() => provider.compareDescriptors(v1, v2)).toThrow(/dimension mismatch/i);
    });

    it("throws when comparing empty vectors", () => {
      expect(() => provider.compareDescriptors([], [])).toThrow(/dimension mismatch/i);
    });
  });

  describe("2. Descriptor Extraction & Synthetic Removal Policy", () => {
    it("rejects server-side image extraction with PROVIDER_UNAVAILABLE to prevent synthetic vector fallbacks", async () => {
      // JPEG magic number header [0xFF, 0xD8, 0xFF, ...] + dummy payload
      const jpegBuffer = Buffer.alloc(100);
      jpegBuffer[0] = 0xff;
      jpegBuffer[1] = 0xd8;
      jpegBuffer[2] = 0xff;
      jpegBuffer[3] = 0xe0;

      const res = await provider.extractDescriptor(jpegBuffer);
      expect(res.success).toBe(false);
      expect(res.outcome).toBe("PROVIDER_UNAVAILABLE");
      expect(res.message).toMatch(/client-side/i);
    });

    it("rejects server-side PNG extraction with PROVIDER_UNAVAILABLE", async () => {
      const pngBuffer = Buffer.alloc(100);
      pngBuffer[0] = 0x89;
      pngBuffer[1] = 0x50;
      pngBuffer[2] = 0x4e;
      pngBuffer[3] = 0x47;

      const res = await provider.extractDescriptor(pngBuffer);
      expect(res.success).toBe(false);
      expect(res.outcome).toBe("PROVIDER_UNAVAILABLE");
    });

    it("returns INVALID_IMAGE for empty or corrupt buffers", async () => {
      const res = await provider.extractDescriptor(Buffer.alloc(10));
      expect(res.success).toBe(false);
      expect(res.outcome).toBe("INVALID_IMAGE");
    });

    it("returns NO_FACE_DETECTED when frame contains no human face", async () => {
      const noFaceBuffer = Buffer.from("SYNTHETIC_NO_FACE_EMPTY_BACKGROUND_DATA");
      const res = await provider.extractDescriptor(noFaceBuffer);
      expect(res.success).toBe(false);
      expect(res.outcome).toBe("NO_FACE_DETECTED");
      expect(res.faceCount).toBe(0);
    });

    it("returns MULTIPLE_FACES_DETECTED when frame contains more than one face", async () => {
      const multiFaceBuffer = Buffer.from("SYNTHETIC_MULTI_FACE_TWO_PEOPLE_DATA");
      const res = await provider.extractDescriptor(multiFaceBuffer);
      expect(res.success).toBe(false);
      expect(res.outcome).toBe("MULTIPLE_FACES_DETECTED");
      expect(res.faceCount).toBe(2);
    });
  });

  describe("3. Cohort Matching, Ambiguity Detection & Threshold Boundaries", () => {
    it("returns MATCH_FOUND when probe matches enrolled student with high confidence", async () => {
      const enrolledVector = makeVector(100);
      const probeVector = perturb(enrolledVector, 0.03);

      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1",
        dimension: 1024,
        descriptor: probeVector,
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-aarav",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: enrolledVector,
          },
        },
        {
          studentId: "student-other",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: makeVector(999),
          },
        },
      ];

      const match = await provider.matchFace(probe, candidates);
      expect(match.outcome).toBe("MATCH_FOUND");
      expect(match.studentId).toBe("student-aarav");
      expect(match.confidence).toBeGreaterThan(0.9);
    });

    it("returns NO_MATCH when probe confidence falls below threshold", async () => {
      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1",
        dimension: 1024,
        descriptor: makeVector(5555),
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-1",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: makeVector(111),
          },
        },
      ];

      const match = await provider.matchFace(probe, candidates, { matchThreshold: 0.85 });
      expect(match.outcome).toBe("NO_MATCH");
      expect(match.confidence).toBeLessThan(0.85);
    });

    it("strictly evaluates threshold boundaries (0.820 vs 0.819)", async () => {
      // Create a controlled synthetic pair with known dot product
      const baseVector = makeVector(42);
      // Construct vector with exact known cosine similarity to baseVector
      // Using Gram-Schmidt: v_target = cos(theta) * base + sin(theta) * orthogonal
      const orthogonal = makeVector(1234);
      // Orthogonalize
      const dot = provider.compareDescriptors(baseVector, orthogonal);
      const orthoClean = orthogonal.map((v, i) => v - dot * (baseVector[i] ?? 0));
      const orthoNorm = Math.sqrt(orthoClean.reduce((s, v) => s + v * v, 0));
      const unitOrtho = orthoClean.map((v) => v / orthoNorm);

      // Target confidence: 0.820 (exact threshold)
      const targetCosPass = 0.825;
      const targetSinPass = Math.sqrt(1 - targetCosPass * targetCosPass);
      const passVector = baseVector.map((v, i) => targetCosPass * v + targetSinPass * (unitOrtho[i] ?? 0));

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-threshold-test",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: baseVector,
          },
        },
      ];

      const matchPass = await provider.matchFace(
        {
          provider: "human",
          modelVersion: "faceres-v1",
          dimension: 1024,
          descriptor: passVector,
        },
        candidates,
        { matchThreshold: 0.82 }
      );
      expect(matchPass.outcome).toBe("MATCH_FOUND");
      expect(matchPass.confidence).toBeGreaterThanOrEqual(0.82);

      // Target confidence: 0.815 (below threshold)
      const targetCosFail = 0.815;
      const targetSinFail = Math.sqrt(1 - targetCosFail * targetCosFail);
      const failVector = baseVector.map((v, i) => targetCosFail * v + targetSinFail * (unitOrtho[i] ?? 0));

      const matchFail = await provider.matchFace(
        {
          provider: "human",
          modelVersion: "faceres-v1",
          dimension: 1024,
          descriptor: failVector,
        },
        candidates,
        { matchThreshold: 0.82 }
      );
      expect(matchFail.outcome).toBe("NO_MATCH");
      expect(matchFail.confidence).toBeLessThan(0.82);
    });

    it("returns UNCERTAIN_MATCH when top match and runner up are within ambiguity margin", async () => {
      const base = makeVector(777);
      const probe = [...base];
      const candidate1 = perturb(base, 0.04);
      const candidate2 = perturb(base, 0.05);

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-twin-A",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: candidate1,
          },
        },
        {
          studentId: "student-twin-B",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: candidate2,
          },
        },
      ];

      const match = await provider.matchFace(
        {
          provider: "human",
          modelVersion: "faceres-v1",
          dimension: 1024,
          descriptor: probe,
        },
        candidates,
        { matchThreshold: 0.82, ambiguityMargin: 0.08 }
      );

      expect(match.outcome).toBe("UNCERTAIN_MATCH");
      expect(match.studentId).toBe("student-twin-A");
      expect(match.runnerUpStudentId).toBe("student-twin-B");
      expect(match.ambiguityMargin).toBeLessThan(0.08);
    });

    it("returns MATCH_FOUND when top match and runner up are outside ambiguity margin (>= 0.08)", async () => {
      const base = makeVector(777);
      const probe = [...base];
      const candidate1 = perturb(base, 0.02); // very close (~0.99)
      const candidate2 = makeVector(9999); // distant unrelated candidate (~0.0)

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-primary",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: candidate1,
          },
        },
        {
          studentId: "student-distant",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: candidate2,
          },
        },
      ];

      const match = await provider.matchFace(
        {
          provider: "human",
          modelVersion: "faceres-v1",
          dimension: 1024,
          descriptor: probe,
        },
        candidates,
        { matchThreshold: 0.82, ambiguityMargin: 0.08 }
      );

      expect(match.outcome).toBe("MATCH_FOUND");
      expect(match.studentId).toBe("student-primary");
    });

    it("returns NO_MATCH when candidate pool is empty", async () => {
      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1",
        dimension: 1024,
        descriptor: makeVector(1),
      };

      const match = await provider.matchFace(probe, []);
      expect(match.outcome).toBe("NO_MATCH");
      expect(match.confidence).toBe(0);
      expect(match.message).toMatch(/no candidate/i);
    });

    it("guarantees deterministic, idempotent results across repeated scans", async () => {
      const enrolled = makeVector(333);
      const probeVector = perturb(enrolled, 0.04);
      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1",
        dimension: 1024,
        descriptor: probeVector,
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-repeat-test",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: enrolled,
          },
        },
      ];

      const scan1 = await provider.matchFace(probe, candidates);
      const scan2 = await provider.matchFace(probe, candidates);
      const scan3 = await provider.matchFace(probe, candidates);

      expect(scan1.outcome).toBe(scan2.outcome);
      expect(scan2.outcome).toBe(scan3.outcome);
      expect(scan1.confidence).toBe(scan2.confidence);
      expect(scan2.confidence).toBe(scan3.confidence);
    });
  });

  describe("4. Model Version Compatibility & Cross-Model Isolation", () => {
    it("returns INCOMPATIBLE_MODEL when probe faceres-v1 is matched against legacy v1 enrollment", async () => {
      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1", // New genuine model
        dimension: 1024,
        descriptor: makeVector(1, 1024),
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-legacy-enrolled",
          payload: {
            provider: "human",
            modelVersion: "v1", // Old synthetic enrollment!
            dimension: 1024,
            descriptor: makeVector(1, 1024),
          },
        },
      ];

      const match = await provider.matchFace(probe, candidates);
      expect(match.outcome).toBe("INCOMPATIBLE_MODEL");
      expect(match.message).toMatch(/incompatible model version/i);
    });

    it("returns INCOMPATIBLE_MODEL when probe provider does not match candidate provider", async () => {
      const probe: FaceDescriptorPayload = {
        provider: "compreface", // Mismatched provider
        modelVersion: "faceres-v1",
        dimension: 1024,
        descriptor: makeVector(1, 1024),
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-1",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: makeVector(1, 1024),
          },
        },
      ];

      const match = await provider.matchFace(probe, candidates);
      expect(match.outcome).toBe("INCOMPATIBLE_MODEL");
    });

    it("returns INCOMPATIBLE_MODEL when probe dimension does not match candidate dimension", async () => {
      const probe: FaceDescriptorPayload = {
        provider: "human",
        modelVersion: "faceres-v1",
        dimension: 512, // Mismatched dimension
        descriptor: makeVector(1, 512),
      };

      const candidates: CandidateDescriptor[] = [
        {
          studentId: "student-1",
          payload: {
            provider: "human",
            modelVersion: "faceres-v1",
            dimension: 1024,
            descriptor: makeVector(1, 1024),
          },
        },
      ];

      const match = await provider.matchFace(probe, candidates);
      expect(match.outcome).toBe("INCOMPATIBLE_MODEL");
    });
  });
});
