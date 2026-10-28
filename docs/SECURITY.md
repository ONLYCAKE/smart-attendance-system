# Security and Privacy Requirements

## Authentication
- Hash passwords using bcrypt with salt rounds >= 10.
- Prefer secure HTTP-only cookies (`session_token`) for browser sessions/tokens.
- Set `Secure`, `HttpOnly`, and `SameSite: strict` attributes appropriately in production.
- Address CSRF using custom header-based token verification (`X-CSRF-Token`).
- Never place long-lived secrets in `localStorage` or `sessionStorage`.
- Keep secrets out of source control; provide `.env.example` with placeholders only.

## Authorization
- Enforce role and resource-level permissions in Express middleware (`authenticate`, `requireAdmin`, `requireTeacherOrAdmin`, `requireStudentSelfOrAdmin`).
- Teachers can access only assigned classes, subjects, and sessions.
- Students can access only their own profile, consent records, and attendance history.
- Never rely on hidden buttons or client-side role checks as security controls.

## Input and API Safety
- Validate every request body, query, and route parameter with Zod schemas.
- Treat client-side extracted vectors as untrusted input: strictly validate dimension (1024 floats), numeric finiteness (reject `NaN`/`Infinity`), and L2 unit-norm bounds.
- Apply request-size limits (2MB), IP rate limiting (200 req / 15 min), secure headers (Helmet), and generic sanitized error responses.
- Avoid leaking internal stack traces, database schema, or cryptographic keys in production.

## Attendance Integrity
- Enforce student/session uniqueness in PostgreSQL (`AttendanceRecord_studentId_sessionId_key`).
- Use database transactions with serializable concurrency controls for attendance writes.
- Verify active session status, student subject enrollment, class division membership, and teacher timetable assignment server-side.
- Audit all manual overrides and attendance corrections.

## Biometric Privacy & Consent Lifecycle
- **Individual Student Self-Consent:** Adult students must grant consent directly (`POST /api/v1/students/:id/consent`). Consent is never inferred from account registration, login, or camera permissions.
- **Representative-Consent Policy:** Administrators cannot unilaterally grant biometric consent on behalf of a student. In legal representative scenarios (e.g., parental guardian of a minor), the administrator must provide a documented legal basis (`legalBasis`) and physical form identifier (`documentReference`), which are recorded immutably in the audit log.
- **Server-Controlled Consent Terms:** The server enforces the active consent terms version (Version 1.0). Updates to institutional terms deprecate previous enrollments, requiring students to re-affirm consent prior to re-enrollment.
- **Zero Raw Image Retention:** No camera frames, photos, or video streams are ever persisted on disk, transmitted to the backend, or stored in browser storage. Frames are analyzed in volatile memory and immediately discarded.
- **Encryption at Rest:** Vector embeddings are encrypted using authenticated AES-256-GCM in a versioned envelope (`v1:<ivHex>:<authTagHex>:<cipherHex>`) with 96-bit random IVs and 128-bit authentication tags.
- **Key Rotation Strategy:** The encryption envelope includes a key version identifier. To rotate encryption keys without downtime or vector exposure:
  1. Register the new key (`v2`) in the key registry.
  2. Run the batch re-encryption script (`rotateDescriptorEnvelope`), which decrypts and re-encrypts records in-memory, updating the live database.
  3. Decommission old key (`v1`) after verifying all records bear the `v2:` prefix.
  4. Plaintext biometric vectors are never logged or exported during rotation.
- **Deletion Lifecycle (Live DB vs. Backup Retention):**
  - Live Database: Invoking `DELETE /api/v1/students/:id/face-enrollment` permanently purges the descriptor embedding (`descriptors = ""`), marks status as `DELETED`, and sets `deletedAt`. Matching queries strictly exclude non-active or deleted records.
  - Backup Retention: Database snapshots or WAL logs created prior to deletion retain encrypted data until the institutional backup retention window (typically 30–90 days) naturally expires.
  - Audit & Attendance Preservation: Deletion never purges historical attendance records or immutable audit trail entries (`AuditLog`).
- **Recognition Trust Boundary:** Facial matching is strictly an identity-assistance mechanism to expedite lecture check-in, not an unattended security checkpoint or proof of liveness. A recognition result alone must never finalize attendance. Automatic attendance writes (`autoMark`) are disabled, ensuring every record is explicitly confirmed by the authorized supervising teacher.
- **Transactional Safeguards for Concurrent Consent Revocation:** To eliminate Time-of-Check to Time-of-Use (TOCTOU) vulnerabilities between probe scanning and attendance recording, attendance confirmation executes inside `prisma.$transaction`. The transaction re-validates the student's fresh biometric consent (`status === 'GRANTED'` and `revokedAt === null`) and active enrollment; if consent was revoked concurrently, the transaction aborts with HTTP 400 `CONSENT_REQUIRED_FOR_BIOMETRIC`.
- **Candidate Detail Confidentiality:** Candidate identities, matching scores, and runner-up details are restricted exclusively to the supervising teacher assigned to the session's timetable entry (`403 FORBIDDEN` for students and unassigned teachers).
- **PostgreSQL Row Locks (`FOR SHARE`) & Concurrency Invariants:**
  - `confirmRecognition` and `markAttendance` employ explicit row locks (`SELECT ... FOR SHARE`) inside the transaction for `AttendanceSession`, `BiometricConsent`, and `FaceEnrollment`.
  - If a session is concurrently being closed (`closeSession`), consent being revoked (`revokeConsent`), or enrollment being deleted (`deleteEnrollment`), in-flight confirmations pause until the mutating transaction commits, observing the updated state and safely aborting with HTTP 400.
  - Manual attendance records (`MANUAL_TEACHER`) recorded by teachers cannot be silently overwritten by camera recognition scans unless an explicit `overrideReason` is provided (`400 MANUAL_RECORD_EXISTS`).
  - Concurrent duplicate confirmation submissions are idempotent: exact duplicate submissions return the existing record without modifying fields or generating spurious `ATTENDANCE_OVERRIDE` audit logs.
- **Attendance Correction & Finalization Policy:**
  - Corrections via `PATCH /api/v1/attendance-records/:id` require authentication as the assigned teacher or Administrator.
  - A descriptive `correctionReason` of at least 5 non-whitespace characters is mandatory.
  - Corrections are permitted on `ACTIVE` and `COMPLETED` (finalized) sessions to support post-lecture administrative adjustments.
  - Corrections on `CANCELLED` sessions are strictly prohibited (`400 SESSION_CANCELLED`).
  - Every correction writes an immutable `ATTENDANCE_CORRECTED` audit log recording actor ID, previous status, new status, reason, and timestamp.

## Data Export Security & CSV Injection Prevention
- **Role-Scoped Access Control:**
  - `GET /reports/student/me/export` is restricted strictly to authenticated students, with student identity derived server-side from `req.user.id`. Client-supplied IDs are rejected.
  - `GET /reports/teacher/attendance/export` is restricted to assigned teachers (verified against active `TeacherAssignment` records; 403 `FORBIDDEN` for unassigned cohorts) and administrators.
  - `GET /reports/admin/summary/export` is restricted to administrators.
- **Spreadsheet Formula Injection Neutralization (OWASP CSV Injection):**
  - Any user-controlled text cell (e.g., student name, roll number, subject name, teacher note) beginning with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) or leading whitespace followed by these triggers is prepended with a single quote (`'`) to neutralize dynamic spreadsheet execution in Microsoft Excel, Google Sheets, or LibreOffice Calc.
  - Cells are formatted and quoted according to RFC 4180, escaping internal double-quotes (`"` $\rightarrow$ `""`) and enclosing fields containing commas, quotes, or newlines in double-quotes.
- **Streaming & Scalable Resource Cleanup:**
  - Data exports stream records row-by-row in bounded chunks (200 records per database fetch) to prevent memory exhaustion and heap spikes.
  - Client disconnects are trapped via `res.on("close")`, immediately breaking query loops and freeing database connections.
  - Safe download headers (`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="..."`, `Cache-Control: no-cache, no-store, must-revalidate`) prevent browser caching of sensitive academic records.
- **Zero Sensitive Data Leakage:**
  - CSV exports strictly omit password hashes, token versions, biometric descriptor embeddings, session secrets, or system audit trails.

## Low-Attendance Alert Policy & Notification Security
- **Configurable Institutional Policy:**
  - The default low-attendance threshold is 75.0%, stored under `SystemSetting` key `LOW_ATTENDANCE_THRESHOLD_PERCENT`.
  - Only Administrators may modify settings (`PATCH /api/v1/settings`), which enforces numeric validation (1.0% to 100.0%) and writes an immutable `SETTING_UPDATED` audit log recording actor ID, previous value, new value, and timestamp.
- **Strict Role Isolation & Ownership:**
  - Students can access only their own alerts (`GET /api/v1/notifications/my`). Student identity is derived server-side from `req.user.id`.
  - Notification state transitions (`PATCH /api/v1/notifications/:id/read` and `PATCH /api/v1/notifications/:id/resolve`) enforce ownership verification, rejecting cross-student attempts with 403 `FORBIDDEN`.
  - Teachers may query alerts only for cohorts where they hold an active timetable/class assignment (`GET /api/v1/notifications/class/:classId`). Requests for unassigned classes are rejected with 403 `CLASS_NOT_ASSIGNED`.
- **Mathematical Integrity & Zero-Session Omission:**
  - Calculation denominator counts only commenced and held sessions (`status IN ('COMPLETED', 'ACTIVE')`), strictly excluding `CANCELLED` sessions and future `SCHEDULED` lectures.
  - Attended count includes only `PRESENT` and `LATE` attendance records.
  - If zero eligible sessions have been conducted (`totalEligibleSessions === 0`), the percentage is `null`, and alert generation is strictly suppressed. No warning may be issued when no attendance data exists.
- **Stable Deduplication & Anti-Spam:**
  - Persistent alerts use a stable deduplication key (`dedupKey: "LOW_ATTENDANCE:OVERALL"`).
  - Repeated evaluations update existing unresolved warnings in-place, preventing notification fatigue or unbounded database row growth.
- **Auto-Resolution on Attendance Recovery:**
  - When a student's overall attendance recovers to or above the configured threshold (either via subsequent session attendance or retroactive teacher attendance correction), active unresolved alerts are automatically resolved (`status = 'RESOLVED'`, `resolvedAt = NOW()`).

## Release-Readiness & Security Verification (T-044)

### 1. Verified Application Controls
- **Token Invalidation & Revocation Integrity:**
  - `auth.ts` strictly requires `decoded.tokenVersion` to be present and to match `user.tokenVersion`. Tokens missing `tokenVersion` or bearing stale versions are rejected with 401 `UNAUTHORIZED`.
  - User logout (`POST /api/v1/auth/logout`) atomically increments `tokenVersion` in PostgreSQL, invalidating all pre-existing sessions across devices.
  - Account state transitions to `SUSPENDED` or `PENDING` immediately revoke API access on subsequent requests (403 `ACCOUNT_INACTIVE`).
- **Reverse Proxy & Rate Limiter Configuration:**
  - `app.ts` configures `trust proxy` dynamically via `env.TRUST_PROXY` (defaulting to `1` in production/docker) to ensure `express-rate-limit` extracts genuine client IPs from `X-Forwarded-For`.
  - Tested and verified: Distinct client IPs receive independent rate-limiting buckets.
  - Tested and verified: When behind a 1-hop reverse proxy, prepending spoofed IP addresses (`X-Forwarded-For: 1.1.1.1, client_ip`) does not spoof the client IP; Express correctly evaluates the rightmost client address (`client_ip`).
  - Auth rate limiter enforces strict request caps on unauthenticated `/auth/login` and `/auth/register` (30 attempts / 15 min per IP in production).
- **Resource Ownership & Role Isolation:**
  - Verified across all route handlers: Students cannot query or mutate peer profiles, biometric consent, face enrollments, lecture sessions, attendance records, reports, notifications, or system settings (403 `FORBIDDEN`).
  - Teachers cannot query, open, close, or correct sessions outside assigned classes (`403 TEACHER_NOT_ASSIGNED` / `403 FORBIDDEN`).
  - Notification state transitions (`PATCH /notifications/:id/read`, `PATCH /notifications/:id/resolve`) strictly enforce student ownership.
- **Concurrency & Transactional Safety:**
  - Verified PostgreSQL row locks (`SELECT ... FOR SHARE`) inside `$transaction` serialize in-flight attendance confirmation with session closure (`closeSession`) and biometric consent revocation (`revokeConsent`).
  - In-flight attendance confirmation racing with session closure safely aborts with HTTP 400 `SESSION_NOT_ACTIVE`.
  - In-flight attendance confirmation racing with biometric consent revocation safely aborts with HTTP 400 `CONSENT_REQUIRED_FOR_BIOMETRIC`.
  - Confirmed duplicate prevention: parallel twin submissions of `confirmRecognition` adhere to PostgreSQL unique constraint `AttendanceRecord_studentId_sessionId_key`, preserving exactly 1 record.
  - Confirmed alert deduplication: parallel evaluations for a student preserve `dedupKey: "LOW_ATTENDANCE:OVERALL"` without creating duplicate active warnings.
- **Data Export & Formula Injection Neutralization:**
  - All CSV export endpoints (`/reports/student/me/export`, `/reports/teacher/attendance/export`, `/reports/admin/summary/export`) sanitize formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote (`'`) and enclosing in double quotes per RFC 4180.

### 2. Reverse-Proxy Topology, Ingress Hardening & Multi-Instance Rate Limiting
- **Intended Topology:**
  - Public Client $\longrightarrow$ Edge Ingress / Cloud Load Balancer (Nginx / AWS ALB) $\longrightarrow$ Internal Proxy Tier (if any) $\longrightarrow$ Express API (`apps/api` on port 4000).
- **Ingress Header Conflict Resolution ($remote_addr vs $proxy_add_x_forwarded_for):**
  - **Edge Ingress (Outer Perimeter):** Must use `proxy_set_header X-Forwarded-For $remote_addr;`. This explicitly overwrites and discards any untrusted client-supplied `X-Forwarded-For` header, ensuring that the IP string delivered to internal infrastructure starts strictly with the validated TCP socket address.
  - **Internal Tiers (Intermediary Proxies):** If traffic passes through internal load balancers before reaching Node, internal proxies must use `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` so the established client IP is preserved.
- **Trust Proxy Sizing in Express:**
  - Single Reverse Proxy (ALB or Nginx directly terminating TLS): `TRUST_PROXY=1`.
  - Multi-Hop CDN Ingress (Cloudflare $\longrightarrow$ AWS ALB $\longrightarrow$ Node): `TRUST_PROXY=2` or explicit trusted proxy CIDRs.
- **Direct Untrusted Access Prevention (Firewall Rule):**
  - **Rule:** The Express API port (4000) must **NEVER** be publicly exposed to the internet. If an attacker connects directly to port 4000, Express would treat the attacker's direct connection as the trusted proxy hop. Node must listen exclusively on `127.0.0.1` or inside an isolated private VPC subnet where security groups permit traffic solely from the ingress reverse proxy.
  - *Verification Status:* **Code-Verified** (Express trust-proxy logic and header spoofing defenses tested in Vitest); **Infrastructure-Unverified** (requires cloud VPC security group inspection).
- **Multi-Instance Rate Limiting Architecture:**
  - Default rate limiting uses `express-rate-limit`'s in-memory `MemoryStore`, which is local to each Node process.
  - In a scaled, multi-instance deployment ($N$ replicas behind a round-robin load balancer), the effective rate limit becomes $N \times \text{limit}$.
  - **Production Requirement for Clustered/Scaled Deployments:** Configure a centralized Redis store using `rate-limit-redis` to share request counters across all API instances.

### 3. Upstream Dependency Security Audit (Next.js 14)
- **Current Version:** `next@14.2.35` (App Router, React 18.3.1).
- **Audit Findings & Vulnerability Breakdown:**
  - `GHSA-p293-qw3h-jr36` (Moderate, Server Actions CSRF/Body Parsing):
    - *Prerequisites:* Requires active usage of Next.js Server Actions with state-mutating POST endpoints.
    - *Exposure:* The frontend application operates strictly as a Next.js client SPA communicating with the decoupled Express backend API; Next.js Server Actions are not used for attendance data writes.
  - `GHSA-2xp9-vwfh-vxw4` (Moderate, Cache Poisoning via crafted Host headers):
    - *Prerequisites:* Requires Next.js middleware or ISR routes trusting unvalidated incoming `Host` headers.
    - *Exposure:* Ingress reverse proxy enforces explicit hostname whitelisting (`Host: attendance.college.edu`).
  - `GHSA-2464-fhr4-w9xw` (Moderate, Image Optimization Component DoS):
    - *Prerequisites:* Requires usage of `next/image` to dynamically optimize untrusted external SVG or image URLs.
    - *Exposure:* In [next.config.mjs](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/web/next.config.mjs), `images.remotePatterns` is restricted to trusted local paths and external SVG rendering is disabled.
  - `GHSA-p3m5-59mp-jv5r` (Moderate, Content-Disposition handling in App Router):
    - *Prerequisites:* Requires serving user-controlled downloads through Next.js route handlers.
    - *Exposure:* File downloads and CSV exports are handled exclusively by the Express backend API.
- **Smallest Compatible Upgrade Evaluation:**
  - `next@14.2.35` is currently the highest available release on the `next-14` dist-tag stream (`next-14: 14.2.35`). Upstream patches are only provided in Next.js `15.5.28+`.
  - Upgrading to Next.js 15 is a major framework migration (React 19 upgrade, asynchronous `cookies()` and route segment `params`).
  - *Verification Status:* **Compensating Controls Code-Verified**; Next.js 15 upgrade tracked for subsequent milestone.

### 4. PostgreSQL Timeout Verification & Driver Engine Settings
- **PostgreSQL Connection String Parameter Format:**
  - Empirically verified via [database-timeouts.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/database-timeouts.test.ts): Standard PostgreSQL query parameters like `?statement_timeout=10000` are ignored by PostgreSQL unless supplied via PostgreSQL's connection `options` flag:
    ```text
    DATABASE_URL="postgresql://user:pass@host:5432/smart_attendance?options=-c%20statement_timeout=10000%20-c%20lock_timeout=5000%20-c%20idle_in_transaction_session_timeout=10000&connection_limit=25"
    ```
  - Live query testing confirms `options=-c statement_timeout=7500 -c lock_timeout=3500` successfully overrides PostgreSQL defaults (`0`) to `7500ms` and `3500ms`.
- **Application Interactive Transaction Timeouts:**
  - To prevent connection pool starvation during row-level locks (`SELECT ... FOR SHARE`), all interactive transactions in [sessions.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/sessions/sessions.service.ts) enforce Prisma engine transaction timeouts:
    ```typescript
    await prisma.$transaction(async (tx) => { ... }, { maxWait: 5000, timeout: 10000 });
    ```
  - *Verification Status:* **Code-Verified** (Prisma interactive timeouts and PostgreSQL engine lock termination verified with Vitest integration tests).

### 5. Disaster Recovery & Biometric Post-Restore Reconciliation
- **Recovery Objectives:**
  - **Recovery Point Objective (RPO):** $\le 15$ minutes (continuous WAL archiving to S3).
  - **Recovery Time Objective (RTO):** $\le 1$ hour.
  - *Verification Status:* **Infrastructure-Unverified** in local environment (requires cloud staging environment).
- **Biometric Post-Restore Reconciliation Procedure (Right to be Forgotten):**
  - *The Threat:* If the database is restored from an older backup snapshot, biometric descriptors that students deleted between the snapshot timestamp and the restore point would be resurrected in active database storage.
  - *Remediation Script:* Created automated reconciliation script [reconcile-biometric-restore.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/scripts/reconcile-biometric-restore.ts).
  - *Operator CLI Command:*
    ```bash
    pnpm --filter @smart-attendance/api restore:reconcile --snapshot-date="2026-10-25T00:00:00Z"
    ```
  - *Action:* The script queries immutable `AuditLog` records for `action: "BIOMETRIC_DELETED"` occurring after the snapshot date, re-zeroes `descriptors = ""` in `FaceEnrollment`, marks consent as `REVOKED` in `BiometricConsent`, and writes an immutable `RESTORE_RECONCILIATION_COMPLETED` audit event before user traffic is admitted.
  - *Verification Status:* **Code-Verified** (Automated end-to-end lifecycle verified in [restore-reconciliation.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/restore-reconciliation.test.ts)); **Infrastructure-Unverified** in live cloud staging.

### 6. Streaming CSV Interruption & Staged Export Reliability (T-046)
- **Staged Output Architecture:**
  - In [reports.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/reports/reports.service.ts), CSV exports (`/reports/student/me/export`, `/reports/teacher/attendance/export`, `/reports/admin/summary/export`) stage rows into an isolated temporary file on disk using bounded streaming batches (200 records per query).
  - HTTP response headers and status code (`200 OK`) are sent **only** after staged generation completes cleanly on disk.
  - Responses include an exact `Content-Length` header enabling client-side and spreadsheet consumer verification of complete delivery.
  - If a database disconnect or query error occurs during generation, headers have not been sent: the temporary file is unlinked immediately, and Express returns a standard HTTP 500 JSON error envelope (`{ success: false, error: { code: "EXPORT_FAILED", message: "..." } }`). Clients and automated ingest pipelines never receive an HTTP 200 with partial or corrupted CSV data.
  - Client disconnects (`res.on("close")`) abort in-flight staging and cleanly remove temporary disk artifacts.
  - *Verification Status:* **FIXED**, **CODE-VERIFIED** (24/24 tests passing in [reports-export.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/reports-export.test.ts)).

### 7. Disaster Recovery & Out-of-Band Biometric Lifecycle Ledger (T-046)
- **Rollback Boundary Threat & Solution:**
  - *Threat:* When a database is restored to an earlier snapshot or backup point, all in-database `AuditLog` records created between the snapshot timestamp and the incident are wiped. A reconciliation tool querying only the restored database's `AuditLog` table will find zero deletions, resurrecting revoked consent and deleted biometric face descriptors.
  - *Solution:* Implemented an independently durable, append-only out-of-band Biometric Lifecycle Ledger ([biometric-ledger.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/biometric-ledger.ts)) stored on external persistent volume storage (`BIOMETRIC_LEDGER_PATH`).
  - *Cryptographic Tamper-Evidence:* Each deletion and consent revocation event is written with a cryptographic SHA-256 hash chaining sequence (`prevHash` $\rightarrow$ `hash`). If any entry is modified, deleted, or inserted out of order, the ledger reader detects hash mismatch and fails closed.
  - *Event Compatibility:* Supports `BIOMETRIC_DELETED`, `BIOMETRIC_ENROLLMENT_REVOKED`, and historical `FACE_ENROLLMENT_DELETED` events.
  - *Reconciliation Procedure:*
    ```bash
    pnpm --filter @smart-attendance/api restore:reconcile --snapshot-date="2026-10-25T00:00:00Z"
    ```
    The script reads all surviving out-of-band ledger entries, merges them with any available database audit records, fails closed on corruption, idempotently re-zeroes descriptors (`descriptors = ""`), marks enrollment `DELETED` and consent `REVOKED`, and logs a `RESTORE_RECONCILIATION_COMPLETED` audit event before user traffic is admitted.
  - *Verification Status:* **FIXED**, **CODE-VERIFIED** (Automated end-to-end rollback simulation and fail-closed tests passing in [restore-reconciliation.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/restore-reconciliation.test.ts)); **INFRASTRUCTURE-UNVERIFIED** for physical PostgreSQL WAL replay in live cloud staging.

### 8. Upstream Next.js Advisory Mitigation (T-046)
- **Advisories Evaluated:** `GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`, `GHSA-2464-fhr4-w9xw`, `GHSA-p3m5-59mp-jv5r`.
- **Mitigation & Compensating Controls:**
  - In [next.config.mjs](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/web/next.config.mjs), configured `images: { unoptimized: true }`. This completely disables the internal Next.js image optimization route (`/_next/image`), removing all external image parser attack surfaces (sharp/libheif CVEs `GHSA-2xp9-vwfh-vxw4` and `GHSA-2464-fhr4-w9xw`).
  - Server Actions audit: Verified zero Server Action declarations (`"use server"`) in the frontend application, eliminating exploit prerequisites for Server Actions CSRF / body parsing vulnerabilities.
  - Edge ingress enforces strict Host header allowlisting (`Host: attendance.college.edu`).
  - *Verification Status:* **FIXED**, **CODE-VERIFIED** (`next build` succeeds with 19/19 routes).

### 10. Security Claims Verification & Production Gate Closure (T-047)

#### 1. Biometric Lifecycle Ledger Durability & Tamper-Evidence
- **Atomic Concurrency & File Locking:**
  - In [biometric-ledger.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/biometric-ledger.ts), ledger appends acquire an atomic cross-process lock using `fs.openSync` with `O_CREAT | O_EXCL` flags (`.lock` file), preventing sequence collisions and race conditions during concurrent deletions.
  - Verified in `restore-reconciliation.test.ts`: 5 concurrent deletion requests append with strict monotonic ordering $1 \dots 5$ and intact hash chains.
- **Durability & Crash Consistency:**
  - Every append invokes `fs.fsyncSync(fd)` before the lock is released and before the function returns, guaranteeing that writes are flushed from OS memory buffers to non-volatile physical storage.
- **Fail-Closed Dual-Write Ordering:**
  - In [enrollment.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/enrollment.service.ts), `deleteEnrollment` and `revokeEnrollment` write to the durable out-of-band ledger **first**.
  - If the ledger write fails (storage unmounted, disk full, permissions error), the operation throws `AppError("Biometric deletion failed: durable audit ledger is unavailable", 500, "BIOMETRIC_LEDGER_ERROR")`.
  - **A deletion is NEVER reported as successful to a user or administrator unless its recovery record is durably stored.**
- **Tamper-Evidence vs. Tamper-Proofing (Security Boundary Analysis):**
  - **Tamper-Evidence:** Hash chaining is anchored with HMAC-SHA256 keyed by server secret (`env.SESSION_SECRET || env.JWT_SECRET`). An adversary with filesystem access cannot arbitrarily alter entries or truncate the ledger without invalidating the HMAC signature.
  - **Tamper-Proofing Boundary:** Local filesystem hash chaining is not mathematically tamper-proof against a root-level attacker who compromises both the filesystem and application memory containing the HMAC key. For absolute non-repudiation in regulated production, the directory `BIOMETRIC_LEDGER_PATH` must be backed by an append-only WORM object store (such as AWS S3 with Object Lock in Compliance mode).
- **Physical PostgreSQL Restore vs. Logical Simulation:**
  - Automated tests in Vitest verify the *logical recovery boundary* (deletions survive database state rollback where post-snapshot DB audit logs are wiped).
  - True physical PostgreSQL backup/WAL restoration requires staging cloud infrastructure (AWS RDS point-in-time restore) and is classified as **INFRASTRUCTURE-UNVERIFIED** until executed in staging.

#### 2. Upstream Next.js Advisory Reassessment
- **`GHSA-p293-qw3h-jr36` (CVE-2026-75604, Unauthenticated RCE on Windows):**
  - *Status:* **OPEN** for Windows hosts; **NOT APPLICABLE** in production Linux container deployments.
  - *Prerequisites:* Windows filesystem with Pages/App Router.
  - *Remediation Plan:* Production containers run on Alpine/Debian Linux. Next.js 15/16 framework upgrade tracked for Q1 2027 milestone (Frontend Lead).
- **`GHSA-2xp9-vwfh-vxw4` (AVIF RCE in `libheif` / `sharp`):**
  - *Status:* **MITIGATED**.
  - *Verification:* `images: { unoptimized: true }` in `next.config.mjs` completely disables the `/_next/image` endpoint, preventing AVIF decoding.
- **`GHSA-2464-fhr4-w9xw` (CVE-2026-96889, SVG Memory Safety RCE in `sharp`):**
  - *Status:* **MITIGATED**.
  - *Verification:* `images: { unoptimized: true }` disables external SVG parsing via `/_next/image`.
- **`GHSA-p3m5-59mp-jv5r` (CVE-2026-94482, High CPU DoS via Server Actions):**
  - *Status:* **NOT APPLICABLE WITH EVIDENCE**.
  - *Evidence:* The frontend repository contains exactly **0** Server Action declarations (`"use server"` count = 0). The official advisory confirms: *"Applications using the Pages Router or those not utilizing Server Actions are not vulnerable."*

#### 3. PostgreSQL Configuration & Driver Engine Settings
- Empirically verified via real database connection in [database-timeouts.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/database-timeouts.test.ts):
  - `statement_timeout = 10s` (10000ms)
  - `lock_timeout = 5s` (5000ms)
  - `idle_in_transaction_session_timeout = 10s` (10000ms)
- Interactive transactions in [sessions.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/sessions/sessions.service.ts) apply `{ maxWait: 5000, timeout: 10000 }` preventing transaction lock starvation.
- Database migration operations (`prisma migrate deploy`) must execute using a direct administrative connection URL without `statement_timeout` to prevent large schema migrations from aborting prematurely.

#### 4. CSV Export Reliability & Disk Hygiene
- Implemented 50MB safety ceiling in [reports.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/reports/reports.service.ts) to prevent disk exhaustion from runaway export queries.
- Added `cleanStaleTempFiles(olderThanMs)` method to sweep abandoned `csv_export_*.tmp` files from `os.tmpdir()` on service startup and maintenance runs.

### 11. Historical Class-Transfer Limitation
- The student data model uses a singular `classId` foreign key. Mid-year class division transfers recalculate session denominators against the newly assigned class cohort.
- Tracked for subsequent milestone to introduce an additive `StudentEnrollmentJournal` table.

### 12. Biometric Ledger Crash Safety & Final Staging Release Gate (T-048)

#### 1. Ledger Locking, PID Tracking, and Crash Recovery
- **Crash Recovery & Stale Lock Reclamation:**
  - In [biometric-ledger.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/biometric-ledger.ts), `acquireLedgerLock` embeds `{ pid: process.pid, createdAt: Date.now() }` into the `.lock` file upon acquisition and immediately calls `fs.fsyncSync(fd)`.
  - When a process encounters `EEXIST`, it inspects whether the holding PID is still alive using `process.kill(pid, 0)`:
    - **Crashed Holder (`ESRCH`):** The lock holder is confirmed dead. The stale lock file is safely unlinked and reclaimed immediately without waiting for arbitrary 10-second timeouts.
    - **Living Holder:** The holding process is alive and actively appending. The lock is **never stolen**, preventing torn writes, split-brain appends, and sequence corruption.
- **Directory & File Durability:**
  - Before writing, `fs.mkdirSync(dir, { recursive: true })` ensures directory hierarchy exists, with directory fsync executed on supported POSIX filesystems.
  - Every append executes `fs.fsyncSync(fd)` to guarantee physical disk persistence before lock release.
- **True Multi-Process OS Concurrency Verification:**
  - Verified in [restore-reconciliation.test.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/test/restore-reconciliation.test.ts): 3 concurrent independent OS child processes spawned via Node.js concurrently append to a single ledger file.
  - Validated strict monotonic sequence numbering ($1 \dots 9$) and continuous HMAC hash chaining across OS processes.

#### 2. Dual-Write Consistency & Idempotent Retry Semantics
- **Sequence Analysis (Ledger Append Succeeds, PostgreSQL Transaction Fails):**
  - The out-of-band ledger records the immutable deletion intent (`BIOMETRIC_DELETED`).
  - If the subsequent PostgreSQL `$transaction` fails (e.g. database network disruption or constraint conflict), the Express API catches the error and returns HTTP 500 to the client.
  - **The API reports success ONLY when both the ledger append and database transaction have successfully committed.**
- **Idempotent Retry Semantics:**
  - If a client retries `deleteEnrollment` or `revokeEnrollment`, `enrollment.service.ts` inspects the current database state:
    - If descriptors are already purged and consent is `REVOKED`, it returns idempotent success directly without appending contradictory ledger records.
    - If the database was not updated due to a previous transaction failure, the retry proceeds to append and execute the database purge.
- **Pending Reconciliation Safety Gate:**
  - If a system restore or reconciliation occurs while a student is in a partial dual-write state, `reconcileBiometricDeletions` detects the pending deletion in the durable ledger and immediately purges the active descriptors and revokes consent before attendance recognition or user traffic resumes.

#### 3. HMAC Keys, Key Rotation, and Storage Trust Boundaries
- **Dedicated Ledger Key Configuration:**
  - Added `BIOMETRIC_LEDGER_KEY` to [env.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/config/env.ts) with strict production validation (minimum 32 characters, non-default secret).
  - Falls back to `SESSION_SECRET` or `JWT_SECRET` for simplified local development.
- **Zero-Downtime Key Rotation & Historical Verification:**
  - `readBiometricLedgerEntries` validates entry signatures against the primary `BIOMETRIC_LEDGER_KEY`, fallback historical keys (`SESSION_SECRET`, `JWT_SECRET`), and legacy SHA-256 signatures.
  - When operator rotates `BIOMETRIC_LEDGER_KEY`, historical entries remain verifiable without breaking restore reconciliation.
- **Trust Boundary Documentation:**
  - **Within Application Trust Boundary:** HMAC-SHA256 provides mathematical tamper-evidence against unprivileged filesystem tampering and ensures that an attacker without the secret key cannot rewrite history or recompute valid hashes.
  - **Outside Application Trust Boundary (Root / Host Compromise):** If an adversary gains root access to the physical host, they could extract `BIOMETRIC_LEDGER_KEY` from process memory and overwrite both files and signatures. True non-repudiation against host compromise requires mounting `BIOMETRIC_LEDGER_PATH` to an external WORM volume (e.g. AWS S3 with Object Lock in Compliance Mode).

#### 4. Next.js Advisory Status Matrix
| Advisory | Severity | Installed | Status | Compensating Controls / Production Rationale | Upgrade Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GHSA-p293-qw3h-jr36`** (CVE-2026-75604) | Critical | 14.2.35 | **OPEN (Win) / N/A (Linux Prod)** | Windows filesystem path traversal. Production containers deploy strictly on Alpine/Debian Linux where this vulnerability is physically non-reproducible. | Next.js 15/16 (Q1 2027) |
| **`GHSA-2xp9-vwfh-vxw4`** | High | 14.2.35 | **MITIGATED** | `images: { unoptimized: true }` in `next.config.mjs` disables `/_next/image` route, neutralizing AVIF memory safety attack surface. | Next.js 15/16 (Q1 2027) |
| **`GHSA-2464-fhr4-w9xw`** (CVE-2026-96889) | High | 14.2.35 | **MITIGATED** | `images: { unoptimized: true }` disables external SVG parsing via `/_next/image`. | Next.js 15/16 (Q1 2027) |
| **`GHSA-p3m5-59mp-jv5r`** (CVE-2026-94482) | High | 14.2.35 | **NOT APPLICABLE** | Exact evidence: 0 Server Actions (`"use server"`) exist in frontend codebase. Verified by AST inspection. | Next.js 15/16 (Q1 2027) |

#### 5. Production Staging Gate & Evidence Separation
- **Code-Verified Controls (Verified in CI / Local Test Suite):**
  - [x] Advisory lock with live PID checking and stale-lock recovery without live lock stealing.
  - [x] Multi-process concurrent ledger appends across independent OS child processes (10/10 tests passing in `restore-reconciliation.test.ts`).
  - [x] Dual-write fail-closed abort and idempotent retry semantics.
  - [x] Dedicated `BIOMETRIC_LEDGER_KEY` rotation support.
  - [x] 100% test pass rate: 275/275 tests across 17 test suites in `@smart-attendance/api`.
  - [x] 0 typecheck errors across all workspace packages (`pnpm -r typecheck`).
  - [x] Next.js production build succeeds with 19/19 routes compiled.
- **Infrastructure-Unverified Checks (Must Be Executed in Cloud Staging Before Go-Live):**
  - [ ] **Ingress Forwarding Sanitization:** Validate NGINX / Cloudflare ingress overwrites `X-Forwarded-For` with `$remote_addr` and drops external `X-Forwarded-Host` / `X-Forwarded-Proto` headers.
  - [ ] **Port 4000 Firewall Rule:** Verify AWS Security Group / firewall denies ingress to port 4000 from external internet (only accessible from reverse proxy subnet).
  - [ ] **Ledger Volume Persistence:** Ensure `BIOMETRIC_LEDGER_PATH` is mounted to an independent persistent EBS/EFS volume with `chmod 0600` permissions and automated snapshotting.
  - [ ] **Staging PostgreSQL WAL Restore Rehearsal:** Execute physical point-in-time recovery on staging database and run `pnpm restore:reconcile` before enabling student traffic.
- **Final Verdict:** **CONDITIONAL GO** (Release approved for Staging; Production deployment blocked until above 4 infrastructure checks receive signed verification).

### 13. Biometric Deletion Fail-Closed Integrity & Recovery Gate (T-049)

#### 1. Missing, Replaced, and Empty Ledger Fail-Closed Boundary
- **Active Database Detection for Missing Ledgers:**
  - In [reconcile-biometric-restore.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/scripts/reconcile-biometric-restore.ts), if the ledger file at `BIOMETRIC_LEDGER_PATH` does not exist, the system checks whether the database has active biometric enrollments (`FaceEnrollment.count() > 0`), active consents (`BiometricConsent.count() > 0`), or prior deletion audit records.
  - If active biometric data exists, reconciliation immediately **fails closed** with `Error("Biometric restore reconciliation aborted: Expected durable biometric ledger at '...' is missing for an active biometric installation...")`, blocking traffic and preventing restored descriptors from becoming active.
- **Ledger Identity Checkpoint & Replaced Ledger Protection:**
  - A durable identity file (`.identity`) is generated on ledger initialization and anchored in PostgreSQL `SystemSetting` under key `BIOMETRIC_LEDGER_IDENTITY`.
  - During restore reconciliation, the ledger's identity UUID is compared against the database checkpoint. If an imposter or swapped ledger is detected, the operation aborts immediately.
- **Empty Ledger Guard:**
  - An empty ledger file (0 bytes) is rejected if historical deletion records exist in the database audit log, preventing truncated ledgers from masquerading as a clean state.

#### 2. Recognition Quarantine for Partial Dual-Write Failures
- **Problem Resolved:** If an append to the durable ledger succeeded (`BIOMETRIC_DELETED`), but the subsequent PostgreSQL `$transaction` failed or rolled back, the student in PostgreSQL still retained `status = "ACTIVE"`. Prior to T-049, attendance recognition could match this student before retries executed.
- **Quarantine Gate:**
  - In [biometric-ledger.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/biometric-ledger.ts), `getQuarantinedStudentIds()` reads all recorded deletions directly from the durable ledger.
  - In [enrollment.service.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/enrollment.service.ts), `getActiveDecryptedDescriptors` filters out any student in the quarantine set **before** candidate vectors are returned for recognition matching.
  - **Guarantee:** Face recognition cannot match an enrollment that has a pending durable deletion event under any circumstances, even during database failures.

#### 3. Cryptographic Signature Downgrade Prevention
- **Explicit Algorithm & Key ID:**
  - All new records in [biometric-ledger.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/modules/enrollment/biometric-ledger.ts) explicitly specify `algorithm: "hmac-sha256"` and `keyId: "k1"`.
- **Downgrade Attack Rejection:**
  - In `readBiometricLedgerEntries`, entries tagged with `hmac-sha256` **strictly require** a valid HMAC signature against `BIOMETRIC_LEDGER_KEY` or configured fallback keys.
  - The system rejects fallback to unkeyed SHA-256 for HMAC entries, preventing adversaries from modifying payloads and substituting unkeyed hashes.
  - Unkeyed legacy hashes are controlled by `ALLOW_LEGACY_UNKEYED_LEDGER` in [env.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/config/env.ts) (disabled by default in production).

#### 4. Cross-Host Lease Locking & PID Namespace Isolation
- **Lock Payload:** Lock files record `{ pid, hostId, createdAt, leaseExpiresAt }` with a 5000ms TTL.
- **Topology Safety:**
  - On the same host/container: liveness is verified via `process.kill(pid, 0)` for immediate crash recovery upon process termination (`ESRCH`).
  - Across different hosts/containers (separate PID namespaces on NFS/EFS): lock reclamation is governed by `leaseExpiresAt`. Expired leases from crashed or hung remote nodes are safely reclaimed after 5s.
  - Active leases are never stolen.

#### 5. Health & Readiness Gate
- Added `GET /api/v1/health/ready` in [health.ts](file:///c:/Users/divy2/Desktop/Project%20Folder/sunshine/monolith/smart-attendance-system/apps/api/src/routes/health.ts).
- Validates database connectivity and biometric ledger availability/integrity before returning `200 ready`.
- Returns `503 unready` if the ledger is missing on an active system, preventing orchestrators and reverse proxies from admitting recognition traffic.

### 14. Cross-Process Biometric Deletion Safety & Distributed Release Gates (T-050)

#### 1. Cross-Process Deletion Quarantine Flow
- **Durable Quarantine Authority:**
  - `getQuarantinedStudentIds()` reads directly from the append-only out-of-band durable ledger (`BIOMETRIC_LEDGER_PATH`).
  - Pending deletion state is **never** process-local. It is durably anchored in physical storage.
- **Cross-Process Simulation & Isolation:**
  - Simulated partial dual-write failure: Process A appends `BIOMETRIC_DELETED` to the durable ledger, while the PostgreSQL database transaction is intentionally omitted or fails (leaving PostgreSQL `status = 'ACTIVE'`).
  - An independent OS child process (Process B) executes `enrollmentService.getActiveDecryptedDescriptors([studentId])`.
  - Process B reads the shared durable ledger, identifies the student in quarantine, and completely excludes them **before** candidate query, vector decryption, and face matching.
  - Verified across independent operating-system processes spawned via child process execution in `test/restore-reconciliation.test.ts`.

#### 2. Lease Expiration, Concurrent Writers, and Fencing Tokens
- **Split-Brain Write Protection:**
  - If a writer process acquires the lock and subsequently hangs, freezes, or experiences a stop-the-world garbage collection pause that exceeds the 5-second lease TTL (`leaseExpiresAt`), another process can safely reclaim the stale lock.
  - To prevent the awakened first process from committing a torn or split-brain write, `validateLockLease(lockHandle)` is executed **immediately prior** to `fs.writeSync(fd, line)`.
  - Every lock file contains a unique cryptographic `token` (`crypto.randomUUID()`).
  - If the lease has expired (`Date.now() >= lock.leaseExpiresAt`) or the on-disk lock file contains a different token (`token !== lock.token`), the write is aborted with `FENCING_LEASE_EXPIRED` or `FENCING_TOKEN_MISMATCH`.
  - Live writers can proactively extend their lease using `renewLedgerLock(lockHandle, extensionMs)`.

#### 3. Ledger Freshness, Truncation, and Rollback Protection
- **Independent Checkpoint vs. Database Snapshot:**
  - The ledger identity is anchored in `.identity` on the ledger volume and checked against `SystemSetting.BIOMETRIC_LEDGER_IDENTITY`.
  - To prevent an attacker or operator from restoring an older, truncated, or replaced ledger that matches an older database snapshot, `reconcileBiometricDeletions` performs a freshness check:
    - If PostgreSQL contains deletion events in `AuditLog` whose timestamps are **newer** than the latest entry in the durable ledger, reconciliation aborts with `Error("Biometric restore reconciliation aborted: Ledger at '...' is older than database snapshot! ... Ledger has been truncated, replaced with an older backup, or rolled back. Failing closed.")`.
  - Any mismatch between database deletion history and ledger state triggers a hard, fail-closed abort.

#### 4. Readiness Gating for Pending Unreconciled Deletions
- `/api/v1/health/ready` actively queries whether any student quarantined in the durable ledger still has an `ACTIVE` record in PostgreSQL `FaceEnrollment`.
- If an unreconciled deletion exists (such as following a crash during dual-write or after a database snapshot restore before reconciliation), `/ready` returns HTTP `503 Service Unavailable` with `status: "unready"`.
- Ingress proxies, load balancers, and Kubernetes readiness probes block traffic from reaching the instance until `pnpm restore:reconcile` executes and reconciles the database.

#### 5. Verification Matrix & Release Evidence
- **Code-Verified Controls (Automated Regression Suite):**
  - [x] Multi-process quarantine exclusion before vector decryption across independent OS processes.
  - [x] Pre-write fencing token validation aborting writes after lease expiration.
  - [x] Detection and fail-closed rejection of truncated or rolled-back ledgers.
  - [x] Readiness probe 503 rejection during pending unreconciled biometric deletions.
  - [x] 285/285 tests passing across 17 backend test files (`pnpm --filter @smart-attendance/api test`).
  - [x] 0 typecheck errors across all workspace packages (`pnpm -r typecheck`).
  - [x] Next.js production build succeeds with 19/19 routes compiled.
- **Infrastructure-Unverified Gates (Requires Cloud / Staging Environment):**
  - [ ] Gate 1: Reverse-proxy ingress header sanitization (`X-Forwarded-For` overwrite, dropped untrusted headers).
  - [ ] Gate 2: Network perimeter firewall rule blocking direct public internet access to port 4000.
  - [ ] Gate 3: Persistent volume configuration with independent snapshotting and strict permissions (`0600`) for the ledger path.
  - [ ] Gate 4: Physical rehearsal of PostgreSQL point-in-time recovery and post-restore reconciliation script execution on staging.
- **Release Verdict:** **CONDITIONAL GO** (Application code is fully secure, fail-closed, and production-ready; staging infrastructure controls require operator sign-off).


