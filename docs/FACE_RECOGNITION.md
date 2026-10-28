# Genuine AI Face Detection & Recognition Architecture

## 1. Overview & Objective
Recognize consented, enrolled students during an explicitly active classroom lecture session. Face recognition operates as an identity-assistance tool under direct supervising teacher oversight. It does not replace teacher confirmation and is not spoof-proof.

---

## 2. Model Specifications & Neural Architecture
- **AI Framework:** Human.js (`@vladmandic/human` v3.3.6), running client-side with hardware-accelerated WebGL/WASM.
- **Licensing:** MIT License (permissive for academic and institutional production use).
- **Face Detector:** BlazeFace (`blazeface.json` / `blazeface.bin`) — rotation-invariant, 6-point landmark detector.
- **Biometric Descriptor Model:** MobileFaceNet (`faceres.json` / `faceres.bin`) — deep convolutional network trained for open-set facial identification.
  - **Input Tensor Dimensions:** `224 × 224 × 3` (normalized RGB floats).
  - **Network Output Layer:** `global_pooling/Mean` tensor.
  - **Embedding Dimensionality:** **1024 floating-point numbers** (unit L2 Euclidean normalized).
  - **Provider / Model Identifier:** `human/faceres-v1`.
- **Model Storage:** All graph topologies and binary weight shards are served locally from `apps/web/public/models/` to guarantee zero dependency on external CDNs or cloud APIs.

---

## 3. Synthetic Removal & Strict Error Policy
- **Zero Synthetic Fallbacks:** All pixel hashing, spatial grid averaging, mock vectors, and `Math.sin(seed + i * 37)` functions have been completely eliminated from the active application codebase.
- **Fail-Closed Inference:**
  - If no face is detected: returns `NO_FACE` (`NO_FACE_DETECTED`).
  - If multiple faces appear in frame: returns `MULTIPLE_FACES` (`MULTIPLE_FACES_DETECTED`).
  - If lighting or orientation is poor: returns `POOR_QUALITY`.
  - If models fail to load or WebGL crashes: returns `MODEL_ERROR` with a descriptive user message.
  - Server-side raw image extraction returns `PROVIDER_UNAVAILABLE`; the server strictly requires client-side WebGL extraction to ensure zero synthetic fallbacks exist.

---

## 4. Client/Server Trust Boundary & Cryptography
1. **Client-Side Extraction:** The user's browser runs BlazeFace + MobileFaceNet via WebGL, producing a unit-normalized 1024-float vector.
2. **Immediate Memory Erasure:** The video frame is processed in volatile GPU/CPU memory and never saved, serialized, transmitted, or logged.
3. **Transmission Security:** Only the extracted float vector is transmitted over TLS to the backend API (`POST /api/v1/students/:id/face-enrollment` or `POST /api/v1/attendance-sessions/:id/recognize`).
4. **Server-Side Validation:** The API validates that all 1024 values are finite floating-point numbers and verifies Euclidean L2 unit length.
5. **Authenticated Encryption at Rest:** The 1024-float vector is serialized to a binary buffer and encrypted using **AES-256-GCM** with a cryptographically random 12-byte initialization vector (IV) and a 16-byte authentication tag (`v1:iv:tag:ciphertext`).
6. **Cohort-Scoped Matching:** During lecture scanning, the server only compares the probe vector against decrypted descriptors belonging to students who are:
   - Officially enrolled in that session's specific class cohort.
   - In active enrollment status (`status: ACTIVE`).
   - In possession of valid, active biometric consent (`status: GRANTED`, `revokedAt === null`).
7. **Similarity Matching:** Server computes cosine similarity:
   $$\text{similarity} = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2}$$
   - **Match Threshold:** $\ge 0.820$.
   - **Ambiguity Margin:** $0.080$. If $\text{topMatch} - \text{runnerUp} < 0.080$, returns `UNCERTAIN_MATCH` to prevent false positive identifications.
8. **Explicit Teacher Confirmation:** Matching candidates are returned to the supervising teacher. Attendance is only finalized when the teacher clicks "Confirm Attendance" (`POST /confirm-recognition`).

---

## 5. Model Versioning & Re-Enrollment Protocol
- **Current Active Model Version:** `faceres-v1`.
- **Legacy Version Compatibility Gating:** Prior synthetic enrollments recorded under model version `v1` are recognized as incompatible by `matchFace()`.
- **Protection Against Silent Reuse:** If a `faceres-v1` live scan is compared against an active cohort containing legacy `v1` enrollments, the server returns `INCOMPATIBLE_MODEL` requiring students to re-enroll using genuine AI facial recognition.
- **Re-Enrollment Flow:** Students visit `/enrollment`, review consent terms, capture a genuine 1024-float embedding via their webcam, and overwrite the legacy vector with a `faceres-v1` record.

---

## 6. Browser Compatibility & Runtime Requirements
- **Supported Browsers:**
  - Google Chrome / Chromium $\ge 90$ (Desktop & Android) with WebGL 2.0.
  - Microsoft Edge $\ge 90$ (WebGL 2.0).
  - Mozilla Firefox $\ge 88$ (WebGL 2.0).
  - Apple Safari $\ge 14.1$ (macOS & iOS WebGL).
- **Camera Requirements:** Standard 640×480 or 720p webcam with balanced ambient lighting.
- **Hardware Acceleration:** WebGL GPU acceleration enabled. Automatically falls back to WASM if WebGL is unavailable.

---

## 7. Limitations & Ethical Safeguards
1. **No Passive Liveness Detection:** Standard MobileFaceNet does not include 3D depth or active challenge-response liveness. A photograph held to a webcam could fool basic 2D cosine matching. For this reason:
   - Automated attendance writes (`autoMark`) are strictly prohibited in the architecture.
   - The supervising teacher is physically present and must confirm candidate identity on their screen.
2. **Right to Erasure:** Students can revoke consent or purge their biometric embeddings at any time via `DELETE /api/v1/students/:id/face-enrollment`. Revocation is immediate and irrevocable, while preserving historical attendance transcripts.
