# Skill: Face Recognition Development

## Required context
Read PRD, architecture, face-recognition design, security, and testing strategy.

## Procedure
1. Verify approved provider, runtime compatibility, license, and model version.
2. Keep provider behind a typed adapter.
3. Handle camera permissions and cleanup.
4. Capture only with consent and minimize retained data.
5. Evaluate registered, unknown, ambiguous, varied-lighting, and multi-face cases.
6. Reject uncertain matches.
7. Validate active session, student eligibility, class membership, and permissions server-side.
8. Write attendance transactionally and rely on database uniqueness.
9. Record metrics without logging biometric material.
10. Document limitations and evaluation results.

## Constraints
Do not claim liveness or spoof resistance without separate implementation and evaluation. Do not silently change the approved provider.
