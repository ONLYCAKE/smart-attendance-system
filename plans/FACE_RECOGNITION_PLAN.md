# Face Recognition Plan

## Gate 1: Provider evaluation
Evaluate Human as first candidate. Confirm package/runtime compatibility, maintenance, model licensing, deployment needs, and supported browser/hardware. Build a small isolated prototype before designing full enrollment storage.

## Gate 2: Evaluation
Use consented volunteers. Test enrolled and unknown people, multiple lighting conditions, angles, repeat scans, ambiguous matches, multiple faces, camera permission failure, model failure, and latency. Document false-acceptance and false-rejection observations.

## Gate 3: Integration
Keep a provider adapter and typed interfaces. Do not couple attendance services to provider-specific details. Protect enrollment data. Do not return all descriptors to clients.

## Gate 4: Attendance
Verify session, teacher, student status, class membership, and match confidence server-side. Reject unknown/ambiguous cases. Record attendance transactionally with unique student/session constraint.

## Fallback
If Human fails the gate, evaluate self-hosted CompreFace and document the decision before proceeding.
