# BookNest — Module 02: Library & Tenant Management LLD

**Version:** 1.0 (design draft for review)  
**Date:** 2026-11-12  
**Target project path:** `docs/lld/02-library-tenant-management.md`  
**Dependencies:** Module 01 Authentication & Authorization; Module 03 Subscription Management (activation policy)

## 1. Scope and boundaries

A library is the tenant boundary in BookNest V1. One owner manages exactly one library; each librarian belongs to one library. This module manages library identity, profile, address, contacts, hours, capacity, facilities, and public visibility.

**Included:** creation as part of owner registration, owner-managed profile, day-specific and overnight hours, IANA time zone, total capacity, public publishing controls, and tenant-scoped access.

**Excluded:** study-plan pricing, memberships, attendance sessions, student ledger, subscription payments, branches, seats, book inventory. These are owned by other modules.

## 2. Invariants

1. Each library has exactly one owner in V1. Each owner has at most one library; registration must create one.
2. Every tenant-owned record is scoped by `libraryId`. Tenant IDs from requests are never authorization evidence.
3. Library subscription is a separate record; no `isPaid` boolean on Library.
4. `totalCapacity` is a positive integer for the whole library, not per study plan. Occupancy is calculated from attendance, not stored as an authoritative counter here.
5. Public visibility requires explicit publication and a valid, complete public profile. Subscription access policy may additionally suppress visibility, to be specified in Subscription LLD.
6. An overnight operating interval is explicit; e.g. 18:00 to 06:00 with `closesNextDay: true`.
7. Library time zones are valid IANA identifiers; store local wall-clock operating times, not arbitrary UTC offsets.
8. Capacity overrides are performed in the relevant business workflow and audited; editing `totalCapacity` is separately audited.
9. Hard deletion of libraries is not exposed in V1; use controlled administrative lifecycle changes.

## 3. Proposed MongoDB schema

Collection: `libraries`.

```ts
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0

type OperatingDay = {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string | null; // HH:mm, 24-hour local time
  closeTime: string | null; // HH:mm
  closesNextDay: boolean;
};

type Library = {
  _id: ObjectId;
  ownerId: ObjectId; // ref User, unique
  name: string;
  slug: string; // unique, public URL identifier
  description?: string;
  contact: {
    email: string;
    phone: string;
    whatsappPhone?: string;
  };
  address: {
    line1: string;
    line2?: string;
    area: string;
    city: string;
    state: string;
    postalCode: string;
    country: string; // ISO 3166-1 alpha-2, default IN for India-only launch if confirmed
    coordinates?: { latitude: number; longitude: number };
  };
  timeZone: string; // e.g. Asia/Kolkata
  operatingHours: OperatingDay[]; // one entry for each day
  totalCapacity: number;
  facilities: string[]; // controlled identifiers; display labels mapped by API/UI
  profileStatus: 'INCOMPLETE' | 'READY'; // derived/validated when profile changes
  isPublished: boolean;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
};
```

**Implementation notes:**
- `ownerId` and `slug` require unique MongoDB indexes. A unique index on `ownerId` enforces one library per owner; application logic must also validate role and ownership.
- `status` is a library administrative status, distinct from tenant subscription state.
- Registration may initially store only required registration fields; profile completion happens after activation. Use separate Zod schemas for registration and profile update.
- Geolocation is optional until distance search is implemented; if enabled, use a GeoJSON point and `2dsphere` index rather than treating plain latitude/longitude as a searchable geospatial index.
- Phone numbers should be normalized to an international format when practical. Do not use Aadhaar/government IDs.
- Avoid storing redundant `currentOccupancy` or `activeMembershipCount` as authoritative fields.

## 4. Validation

**At registration:** library name (2–160 chars), owner reference (server-generated), initial contact details and basic location fields as agreed with the registration form, and selected subscription plan (handled by Subscription module). Generate unique slug server-side, resolving collisions. Default library status `PENDING`, `isPublished: false`.

**At profile completion:** valid contact phone/email, required address, IANA time zone, integer capacity >= 1, seven distinct operating-day entries with day indices 0–6, valid `HH:mm` values, closed days with null times, open days with both times, and consistent overnight flags. For same-day hours, closing time must be later than opening time; for overnight hours, closing time is on the next day. A 24-hour schedule needs an explicit representation rule, finalized before implementation (e.g. 00:00–00:00 with `closesNextDay: true`).

A library cannot publish without the required public profile and at least one active study plan; Study Plans module supplies that readiness check. Do not allow public API clients to set `status`, `ownerId`, or subscription state.

## 5. Authorization matrix

| Operation | Platform Admin | Owner (own library) | Staff | Public |
|---|---|---|---|---|
| Read public profile | Yes | Yes | Yes | Published only |
| Read internal library profile | Authorized support only | Yes | Permission-based | No |
| Update profile / hours / capacity | Authorized support only, audited | Yes | Only if explicitly permitted | No |
| Publish/unpublish | Authorized support only, audited | Yes | No by default | No |
| Change owner / status | Controlled admin workflow | No | No | No |

All owner/staff operations derive tenant scope from authenticated context. Platform-admin cross-tenant operations require explicit privileged routes and audit logging. Subscription middleware blocks writes after the approved grace period unless an explicitly documented administrative exception applies.

## 6. Proposed REST API

Base prefix `/api/v1`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/library/me` | Authenticated owner's/staff's library profile |
| PATCH | `/library/me` | Owner updates general profile/contact/address/facilities |
| PUT | `/library/me/operating-hours` | Replace full seven-day schedule |
| PATCH | `/library/me/capacity` | Update total library capacity with audit reason |
| POST | `/library/me/publish` | Publish after readiness validation |
| POST | `/library/me/unpublish` | Unpublish |
| GET | `/public/libraries/:slug` | Public view of published library |

Public library listing/search is part of the public discovery module; it must return only approved public fields. Never expose owner email, staff user records, internal audit fields, or private tenant configuration through public responses. Contact fields intentionally made public must be explicitly selected.

**Example capacity update:**

```json
{ "totalCapacity": 80, "reason": "Expanded study hall" }
```

Response envelope follows API conventions (`success`, `data`, `message` where relevant). Use `400` for validation, `401` unauthenticated, `403` unauthorized, `404` unavailable/out-of-tenant resource, `409` uniqueness/state conflicts, and `503` when a dependency is unavailable.

## 7. Owner registration integration

Owner registration is orchestrated by Auth/Onboarding service, not by a public unrestricted library-creation endpoint:

1. Validate owner, library registration details, and chosen plan (`FREE_TRIAL`, `MONTHLY`, `QUARTERLY`, `YEARLY`, `FIVE_YEAR`).
2. Within a MongoDB transaction, create pending owner, pending library, and pending subscription/onboarding record, linking `user.libraryId` and `library.ownerId`.
3. Generate email OTP and enqueue/retry delivery through central BookNest EmailService. Do not depend on sending email inside the DB transaction.
4. After verified email: optional trial becomes active for 30 days; paid plan remains awaiting manual UPI confirmation by Platform Admin.
5. Once subscription permits access, owner completes profile and configures at least one active study plan before publication/membership creation.

Ensure retries do not create duplicate owners/libraries/subscriptions; enforce uniqueness and idempotency in the onboarding workflow. Subscription effective dates and pending payment states belong to Module 03.

## 8. Tenant security design

- Authentication middleware establishes `userId`, `role`, and trusted `libraryId` from the verified session/account.
- Tenant-owned queries include `libraryId` in their filters; single-record operations use both `_id` and `libraryId`.
- A client-supplied library ID can be a resource locator only on explicitly privileged platform-admin routes, never a substitute for tenant authorization.
- Public queries use `isPublished` plus required publication/subscription policy and a projection of allowed fields.
- Staff permissions are checked per operation; front-end visibility is not security enforcement.
- Audit library profile publication, capacity, hours, and status changes with actor, timestamp, before/after summary, and reason where relevant.

## 9. Service and file boundaries

Suggested incremental structure:

```text
apps/api/src/modules/library/
  library.model.ts
  library.validation.ts
  library.service.ts
  library.controller.ts
  library.routes.ts
```

Add shared middleware for tenant scoping and authorization as the API endpoints are implemented. Do not create empty placeholder files in advance.

## 10. Test plan

- Model: required fields, unique owner and slug indexes, valid/invalid hours, capacity boundary, timestamps.
- Onboarding: atomic owner/library/subscription creation; rollback on failure; retry/idempotency; unique owner constraint.
- Tenant isolation: owner/staff from Library A cannot read or modify Library B, including guessed IDs.
- Permissions: staff cannot publish by default; suspended users and read-only subscriptions cannot perform prohibited writes.
- Publication: incomplete profiles cannot publish; unpublished libraries are not exposed publicly; publication readiness checks study plan.
- Overnight schedules: 18:00–06:00 works; invalid overlapping/ambiguous intervals rejected according to agreed policy.
- Capacity: single total capacity; update audited; no automatic per-plan allocation.
- Public privacy: only explicitly allowed fields are returned.

## 11. Open implementation decisions

1. Final required fields for the *initial* registration screen versus post-registration profile completion.
2. Whether staff can edit specific library fields, and which permissions govern them.
3. Exact 24-hour operating-hours representation and handling of exceptional holiday closures (can be deferred from V1 if not required).
4. Public visibility behavior for subscriptions in grace/read-only states, to be finalized in Module 03.
5. Approved facilities vocabulary and address/geocoding strategy for distance-based public search.

These do not block creating the basic Library model; they must be resolved before implementing affected endpoints.

## 12. Implementation sequence

1. Review this LLD and commit the approved document.
2. Create `library.model.ts` with schema and indexes; build and test.
3. Create validation and service layer for library creation/profile update.
4. Design and implement Subscription model (Module 03).
5. Implement transaction-safe owner onboarding with optional plan selection.
6. Add tenant-scoped APIs, publication checks, authorization and integration tests.

**Status:** Proposed for user review; not yet implemented or committed.
