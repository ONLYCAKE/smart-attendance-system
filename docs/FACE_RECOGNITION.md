# Face Recognition Design and Evaluation

## Goal
Recognize consented, enrolled students during an explicitly selected active lecture session. Basic recognition is not liveness detection and must not be represented as spoof-proof.

## Provider decision
First candidate: Human JavaScript face analysis library.
Fallback: self-hosted CompreFace if the technical spike fails.

## Spike acceptance checks
- Confirm package maintenance/status and compatibility with the chosen runtime.
- Review license terms for the package and model weights.
- Confirm browser or service deployment requirements.
- Test webcam capture and model loading on target machines.
- Evaluate multiple samples per consenting volunteer under different lighting and angles.
- Measure false acceptance, false rejection, latency, and unknown-face behavior.
- Confirm descriptors can be deleted and are not logged.
- Document results and final decision in `docs/DECISIONS.md`.

## Workflow
1. Admin approves student and records consent.
2. Capture several usable samples.
3. Extract descriptors with the selected provider.
4. Save descriptors or a provider-side enrollment reference, model version, and status.
5. Start a permitted lecture session.
6. Detect a face and produce a descriptor.
7. Compare only against eligible enrolled students for the relevant scope.
8. Reject no-match or ambiguous results.
9. Enforce class/session membership and permissions on the backend.
10. Insert attendance transactionally with unique student/session constraint.

## Safety and privacy
- Do not retain raw enrollment images by default.
- Do not return all descriptors to the browser.
- Never log raw images or descriptors.
- Provide enrollment deletion.
- Limit who can enroll, re-enroll, or delete biometric data.
- Treat all browser inputs as untrusted.
- Evaluate liveness separately; basic descriptor matching can be fooled by presentation attacks.
