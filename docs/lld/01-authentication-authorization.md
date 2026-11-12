# BookNest — Authentication & Authorization Low-Level Design

**Version:** 1.0 (Approved baseline)  
**Date:** 12 November 2026  
**Module:** 01 — Authentication & Authorization  
**Repository location:** `docs/lld/01-authentication-authorization.md`

## 1. Scope and confirmed decisions

BookNest V1 authenticates Platform Admin, Library Owner and Librarian/Staff accounts. Students/public visitors do not log in. Owners and staff use **email and password**; verified email is required before normal access. Verification uses an **email OTP** delivered by the central BookNest EmailService. No mobile OTP in V1. Platform Admin accounts are securely provisioned, not publicly registered. Owners self-register; owners create/invite staff. One owner controls exactly one library in V1; staff belongs to one library. All tenant data access must be server-scoped.

### Out of scope
Student self-service authentication; SMS/WhatsApp OTP; OAuth/social login; multi-library owner accounts; SSO; automated payment gateways.

## 2. Architectural responsibilities

- **React UI:** forms, OTP entry, auth state, navigation, error display. Never the authority for permissions.
- **Express routes/controllers:** parse requests, validate with Zod, invoke services, map errors.
- **AuthService:** register, verify, login, refresh, logout, reset password, manage sessions.
- **Authorization middleware:** authentication, account state, role/permission checks, tenant scope and subscription write access.
- **EmailService:** one BookNest sender, provider abstraction, retryable dispatch; library Reply-To for applicable student emails.
- **MongoDB/Mongoose:** users, sessions, OTP challenges, password reset challenges, staff permissions, audit logs. Library and subscription creation owned by respective modules and orchestrated during registration.

## 3. Security decisions

- Normalize emails (trim and lowercase consistently) and enforce a unique index.
- Hash passwords with Argon2id; never store plaintext or reversible passwords.
- Use short-lived signed access tokens (initial target 15 minutes) and rotating opaque refresh tokens (initial target 7 days). Store **hashes** of refresh tokens; revoke on logout, password reset or account suspension. Detect reuse of a rotated refresh token and revoke its token family.
- Use Secure, HttpOnly cookies in production, appropriate SameSite settings, HTTPS and CSRF protection for cookie-authenticated state-changing requests. Decide frontend/API deployment origins and cookie configuration before coding cookie transport.
- Never log passwords, OTPs, raw refresh tokens or reset secrets.
- Return generic responses for forgotten-password requests and avoid account enumeration. Rate-limit login, OTP generation/verification and reset endpoints by IP and account.
- OTP: six random numeric digits, 5-minute expiry, at most 5 failed attempts, 60-second resend cooldown, invalidate prior active OTP on resend, hash stored challenge, consume once. These are approved initial implementation defaults, subject to testing and abuse monitoring.
- Password reset: single-use, expiring random token, hashed at rest; revoke existing sessions on successful reset.
- All sensitive mutations create audit events with actor, action, target, timestamp and reason where relevant.

## 4. Roles and authorization

| Role | Scope | Core rights |
|---|---|---|
| PLATFORM_ADMIN | Platform | Provision/manage platform operations and subscription verification; no automatic access to library private data without explicitly designed support policy |
| LIBRARY_OWNER | Own library | Manage library, staff, plans, students, memberships, finance, attendance and reports subject to subscription state |
| LIBRARIAN | Assigned library | Only permissions granted by owner; cannot self-approve owner-only operations |
| Public visitor/student | Public endpoints | Browse public library profiles; no authenticated student portal in V1 |

Example permission keys: `students.read`, `students.create`, `students.update`, `memberships.read`, `memberships.create`, `attendance.check_in`, `attendance.check_out`, `attendance.correct`, `finance.payments.record`, `finance.refunds.request`, `reports.read`. Define a typed permission registry in shared code and explicitly map every protected route to a required permission. Staff cannot approve their own refund or price override; owner approval is required.

For every tenant resource, derive `libraryId` from the authenticated principal and enforce it in database filters and write predicates. Do not authorize from request-provided `libraryId`. Resource IDs are not authorization. Cross-tenant lookups must return a non-disclosing error (typically 404). Public routes expose only intentionally public fields.

Subscription enforcement: active trial/paid/grace permits normal authorized operations; after 7-day grace expiry, read-only permits allowed reads/exports but denies all writes. Authentication, payment recovery and essential subscription renewal operations must remain available through carefully scoped exceptions.

## 5. Data models and indexes

### 5.1 `users`

```ts
type UserRole = 'PLATFORM_ADMIN' | 'LIBRARY_OWNER' | 'LIBRARIAN';
type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
interface User {
  _id: ObjectId;
  email: string;               // normalized, unique
  fullName: string;
  passwordHash: string;
  role: UserRole;
  libraryId?: ObjectId;       // required for owner/staff; absent for admin
  emailVerifiedAt?: Date;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes: unique `email`; `libraryId, role, status` for tenant staff listings. Validate role/library relationship in service logic. Owner registration requires exactly one new library; future multi-tenant account support would require a separate user-tenant membership mapping.

### 5.2 `authSessions`

```ts
interface AuthSession {
  _id: ObjectId;
  userId: ObjectId;
  tokenFamilyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}
```

Indexes: `userId, revokedAt`, unique `refreshTokenHash`, TTL on `expiresAt` for cleanup. Authorization must check expiration/revocation explicitly; TTL cleanup is not immediate.

### 5.3 `emailOtps`

```ts
interface EmailOtp {
  _id: ObjectId;
  userId: ObjectId;
  purpose: 'VERIFY_EMAIL';
  otpHash: string;
  expiresAt: Date;
  attemptCount: number;
  consumedAt?: Date;
  createdAt: Date;
  lastSentAt: Date;
}
```

Indexes: `userId, purpose, createdAt`; TTL cleanup on expiry. Rate limits and attempt counters must be updated atomically. Because six-digit OTPs have low entropy, use a keyed HMAC or comparably secure server-secret-based hash rather than relying on an unsalted fast digest.

### 5.4 `passwordResetTokens`

```ts
interface PasswordResetToken {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}
```

Single-use token; use cryptographically secure random bytes. Define expiry (initial target 30 minutes) and rate limits. TTL cleanup is supplementary, not authorization.

### 5.5 `staffPermissions`

```ts
interface StaffPermissions {
  _id: ObjectId;
  userId: ObjectId;
  libraryId: ObjectId;
  permissions: string[];
  updatedBy: ObjectId;
  updatedAt: Date;
}
```

Unique index on `userId`; validate all permission keys against registry. Every update requires owner authorization and audit log.

## 6. API contracts (prefix `/api/v1`)

The owner registration payload includes `subscriptionPlanCode` with one of `FREE_TRIAL`, `MONTHLY`, `QUARTERLY`, `YEARLY`, `FIVE_YEAR`. The server resolves pricing from its own catalogue. Manual UPI payment submission and Platform Admin verification endpoints are specified in Module 03, not duplicated here.

| Method | Route | Access | Behavior |
|---|---|---|---|
| POST | `/auth/register-owner` | Public, rate-limited | Create owner + library + selected subscription (optional trial or paid), queue OTP |
| POST | `/auth/verify-email` | Verification flow | Consume valid OTP, activate account |
| POST | `/auth/resend-otp` | Verification flow | Invalidate old OTP and send new OTP after cooldown |
| POST | `/auth/login` | Public, rate-limited | Validate credentials/status, issue session cookies |
| POST | `/auth/refresh` | Valid refresh session | Rotate refresh token and access token |
| POST | `/auth/logout` | Authenticated/session | Revoke current session, clear cookies |
| POST | `/auth/logout-all` | Authenticated | Revoke all user's sessions |
| GET | `/auth/me` | Authenticated | Return safe user profile, role, tenant and permissions |
| POST | `/auth/forgot-password` | Public, rate-limited | Generic response; send reset email when eligible |
| POST | `/auth/reset-password` | Valid reset token | Set new password; revoke sessions |
| POST | `/staff` | Library owner | Create/invite staff within owner's library |
| PATCH | `/staff/:id/permissions` | Library owner | Update staff permission set with audit |
| PATCH | `/staff/:id/status` | Library owner | Suspend/reactivate staff and revoke sessions if suspended |

Standard JSON response shape: `{ data: ... }` on success; `{ error: { code, message, details? } }` on failure. Do not expose internal exceptions or secret fields. Validate all request bodies and route parameters with Zod. Set appropriate HTTP codes (201 creation, 200 success, 400 validation, 401 unauthenticated, 403 unauthorized, 404 absent/out-of-scope, 409 duplicate, 429 throttled).

## 7. Detailed workflows

### 7.1 Owner registration

1. Validate owner name/email/password and required library fields.
2. Normalize email and check uniqueness (unique DB index is final defense).
3. Hash password.
4. Require a subscription selection: `FREE_TRIAL`, `MONTHLY`, `QUARTERLY`, `YEARLY`, or `FIVE_YEAR`. Obtain price and duration from the platform-controlled plan catalogue; never trust a client-submitted price.
5. In a MongoDB transaction, create the owner in `PENDING_VERIFICATION`, their library, a pending subscription record for the selected plan, and a durable email outbox record (or equivalent reliable dispatch request). Do not start a trial before email verification.
6. After commit, dispatch OTP via EmailService. If sending fails, retry and allow a rate-limited resend; do not roll back valid registration merely because SMTP is temporarily unavailable.
7. On correct unexpired OTP, atomically consume challenge, set `emailVerifiedAt`, and activate the user account. For `FREE_TRIAL`, activate the 30-day trial starting at verification (only once per eligible owner/library, with anti-abuse checks). For paid plans, keep the subscription `PENDING_PAYMENT` or `PENDING_VERIFICATION` until BookNest Platform Admin confirms the direct UPI payment; then activate the paid term from the verified activation date.
8. An email-verified owner with a pending paid subscription may sign in only to a limited subscription/payment-status area, not the full tenant-management dashboard. Admin payment confirmation must be auditable and reject duplicate transaction references.

MongoDB deployment must support transactions (replica set). Ensure retry-safe registration to avoid duplicate owner, library, or subscription records. BookNest subscription billing is separate from student-to-library payments. Subscription activation details belong to Module 03.

### 7.2 Login

1. Validate email/password.
2. Find user by normalized email; compare password hash with timing-safe library behavior.
3. Reject unverified, suspended or invalid credentials with non-leaking responses. Email-verified owners awaiting paid-subscription confirmation may authenticate only for restricted subscription/payment-status operations.
4. Create refresh session and signed access token, set secure cookies.
5. UI requests `/auth/me` and renders role/permissions; server independently enforces all permissions.

### 7.3 Refresh and logout

Refresh: verify token hash and session state, atomically rotate token, detect reuse and revoke family if compromised. Logout: revoke current session and clear cookies. Logout-all: revoke all sessions. Expired access tokens should be rejected; client may retry once after refresh to avoid infinite loops.

### 7.4 Staff creation

Owner authenticates and supplies staff name/email and allowed permissions. Backend derives owner's `libraryId`, creates pending staff user/invitation and sends email verification/setup instructions. Do not email plaintext passwords. Staff completes secure password setup and email verification before login. Duplicate email across tenant accounts is rejected in V1; future multi-library identities require redesign of association model, not silent duplication.

### 7.5 Password reset

Generate single-use random reset token, hash it in DB, send email with expiry; return generic response whether email exists or not. Validate token, change password hash, mark token used and revoke sessions in an atomic workflow. Audit event excludes token.

## 8. Middleware order and responsibilities

Public routes: input validation and abuse controls. Protected routes: `authenticate` -> `requireVerifiedActiveUser` -> `requireRole/Permission` -> `resolveTenant` -> `requireSubscriptionWriteAccess` (for tenant writes) -> controller. Some platform routes have no tenant middleware; public browsing routes use only public field projections. The subscription middleware must not block login, email verification, reset, permitted read/export, or subscription recovery endpoints.

Authorization middleware must use trusted server-side context. For write operations, tenant filter must be part of the database mutation itself to prevent check-then-write races.

## 9. Frontend design

Routes: owner registration, verify email, login, forgot password, reset password, owner dashboard, staff dashboard and unauthorized state. Auth bootstrap uses `/auth/me`; don't persist access/refresh secrets in localStorage. UI can hide unauthorized controls for usability, but API authorization remains authoritative. Support expired session and resend OTP states with accessible error messages.

## 10. Email implementation

`EmailService` exposes `sendVerificationOtp`, `sendPasswordReset` and later library-specific reminder methods. One dedicated BookNest sender account for initial testing/low volume. Credentials live in environment secrets. Provider abstraction allows migration from Gmail/SMTP to a transactional provider. Use retryable outbox/queue dispatch, structured delivery status, and templates without secrets in logs. Library reminders can set verified/approved library Reply-To; never request staff mailbox passwords.

## 11. Auditing and observability

Audit registration, verification, login failures (without secrets), successful login, password reset, staff creation/suspension, permission changes, session revocations, tenant authorization denials and subscription-write denials. Record actor, target, tenant, action, timestamp and contextual reason. Rate-limit events and mail failures should be observable without exposing private values.

## 12. Test matrix and acceptance criteria

- Owner registration creates exactly one owner, library and selected subscription; retries do not duplicate. Trial starts only after email verification; paid plans remain pending until manual UPI verification by Platform Admin.
- Duplicate email blocked by unique index; invalid payload rejected.
- Password stored only as Argon2id hash; not returned by API.
- OTP verification succeeds once, fails on wrong/expired/consumed OTP, limits attempts and resend frequency.
- Unverified/suspended accounts cannot access protected features.
- Login, refresh rotation, logout and logout-all work; reuse of old refresh token is detected.
- Password reset expires, is single-use and revokes sessions.
- Owner can manage only own library staff; librarian cannot assign self elevated permissions.
- Librarian A cannot read/update Library B resources by guessing IDs.
- Staff cannot approve own refund or price override.
- Read-only subscription blocks writes but allows permitted reads/exports and subscription recovery.
- CSRF protections, cookie security settings, rate limiting and no-secret logging verified.

## 13. Suggested files

```text
apps/api/src/
  modules/auth/
    auth.routes.ts
    auth.controller.ts
    auth.service.ts
    auth.validation.ts
    user.model.ts
    auth-session.model.ts
    email-otp.model.ts
    password-reset-token.model.ts
  modules/staff/
    staff.routes.ts
    staff.service.ts
    staff-permissions.model.ts
  middleware/
    authenticate.ts
    authorize.ts
    tenant-scope.ts
    subscription-access.ts
  services/
    email.service.ts
  config/
packages/shared/src/
  auth/
    permissions.ts
    schemas.ts
```

Adapt to actual repository layout after inspecting it; do not create duplicate app structures.

## 14. Implementation sequence

1. Inspect existing repo and scripts; confirm current source layout.
2. Add environment configuration, MongoDB connection, health readiness and test database.
3. Add shared validation schemas and User model; test indexes and hashing.
4. Implement owner registration transaction with library/selected-subscription orchestration and email outbox.
5. Implement email OTP and central EmailService.
6. Implement login, access/refresh sessions, logout and password reset.
7. Add middleware for permissions, tenant isolation and subscription state.
8. Implement owner/staff account management.
9. Build React auth screens and end-to-end flows.
10. Add abuse, security and cross-tenant tests; review before next module.

**First coding step:** inspect existing repository files and configuration; avoid replacing already-working setup. The first source-code change after inspection should be MongoDB connection/configuration and a database readiness check, with a test.

## 15. Items to settle during implementation (not changes to approved business scope)

- Frontend/API production origin and secure cookie/CSRF configuration.
- Email provider for initial environment and SMTP secrets.
- MongoDB local or managed replica-set environment.
- Staff invitation/setup-token delivery specifics.
- Exact public registration library fields (align with Library LLD).
- Final token/OTP durations and rate limits based on security tests.
