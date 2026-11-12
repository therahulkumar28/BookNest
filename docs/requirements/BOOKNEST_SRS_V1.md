# BookNest — Software Requirements Specification

**Version:** 1.2  
**Status:** Final V1 Scope — Pending Formal Sign-off  
**Product:** BookNest  
**Document:** `docs/requirements/BOOKNEST_SRS_V1.md`

---

## 1. Introduction

### 1.1 Purpose

BookNest is a multi-tenant SaaS platform for independent libraries and study spaces. It enables library owners to manage their library operations, staff, study plans, students, memberships, attendance, and finances.

BookNest also provides a public library discovery website where visitors can search for libraries, view facilities and study plans, and contact libraries directly.

### 1.2 Product objectives

- Simplify library operations.
- Provide centralized student and membership management.
- Manage staff and permissions.
- Configure study plans, durations, and prices.
- Record attendance through manual and QR-code methods.
- Maintain accurate financial records.
- Provide library discovery to the public.
- Provide a secure multi-tenant SaaS platform.

### 1.3 V1 scope principles

- The library owner is the BookNest customer.
- Each owner manages one library in V1.
- Students do not have BookNest accounts in V1.
- Students contact libraries directly to arrange membership.
- Library owners and authorized staff create student and membership records.
- BookNest subscription billing is separate from student-to-library financial transactions.

---

## 2. Product Scope

### 2.1 Included in V1

1. Platform administration.
2. Owner registration and authentication.
3. One library per owner.
4. Library profile and public discovery.
5. Library operating hours, including overnight schedules.
6. Library-wide capacity management.
7. Staff management and configurable permissions.
8. Study-plan management.
9. Pricing management.
10. Student/member management.
11. Membership creation and linked renewals.
12. Manual and QR-code attendance.
13. Student financial ledger.
14. BookNest subscription management.
15. Reports and audit logs.

### 2.2 Excluded from V1

- Student login and self-service portal.
- Student self-service registration.
- Student online payments through BookNest.
- Appointment and seat booking.
- Student self-service membership renewal.
- Book catalogue and inventory.
- Book issue, return, and reservation management.
- Multiple branches under one owner account.

Architecture shall support future additions without requiring a redesign of the core system.

---

## 3. User Roles

### 3.1 Platform Admin

Manages the BookNest SaaS platform, tenants, subscriptions, platform configuration, and platform-level reports.

### 3.2 Library Owner

Manages one library and its operations, including:
- Library profile and hours.
- Capacity.
- Staff and permissions.
- Study plans and pricing.
- Students and memberships.
- Attendance.
- Financial records.
- Reports.
- BookNest subscription.

### 3.3 Librarian / Staff

Staff members are created by the owner. Their permissions are individually configurable, with predefined permission templates available.

Possible permissions include:
- View and manage students.
- Create memberships.
- Record attendance.
- Correct attendance.
- Record payments.
- View financial records.
- Request price overrides.
- View reports.

Sensitive operations requiring owner approval shall not be completed solely through staff permissions.

### 3.4 Student / Public Visitor

Students do not authenticate in V1.

Visitors can:
- Search public libraries.
- View public profiles.
- View facilities and study plans.
- View operating hours.
- Reveal contact numbers.
- Contact libraries directly.

---

## 4. Functional Requirements

### 4.1 Authentication and Authorization

- Secure authentication shall be provided for platform admins, owners, and staff.
- Role-based and permission-based authorization shall be enforced on the backend.
- Passwords shall be securely hashed.
- Protected resources shall not be accessible to unauthorized users.
- Staff access shall be restricted to their own library.

### 4.2 Tenant and Library Management

- One owner account shall manage one library in V1.
- Every library shall belong to one tenant.
- Tenant-owned records shall contain a tenant/library association.
- Backend services shall derive tenant context from authenticated identity.
- Frontend-provided tenant identifiers shall never be trusted without authorization validation.
- Cross-tenant access shall be prevented and covered by automated tests.

### 4.3 Library Profile

Owners shall manage:
- Library name.
- Description.
- Address and location.
- Contact number.
- Public profile information.
- Facilities and amenities.
- Images.
- Public visibility.

Only approved public information shall be exposed to visitors.

### 4.4 Operating Hours

- Owners shall configure operating hours for each day of the week.
- Different schedules may be configured for different days.
- Closed days shall be supported.
- Overnight schedules shall be supported.
- An overnight schedule shall correctly represent a start on one calendar day and an end on the next.
- Each library shall have its own configurable time zone.
- Time calculations and attendance records shall use the appropriate library time zone.
- Invalid or ambiguous schedules shall be rejected.

Example: Monday 6 PM to Tuesday 6 AM.

### 4.5 Library Capacity

- Each library shall have one total capacity value.
- Capacity shall represent the maximum number of students the library can accommodate simultaneously.
- Capacity shall be managed at library level, not separately by study plan.
- The system shall show capacity warnings when the library reaches its configured limit.
- The owner shall be able to override capacity restrictions.
- Capacity overrides shall be auditable.
- The system shall not provide seat selection or seat booking in V1.

The system shall distinguish:
- Total capacity.
- Current occupancy.
- Active memberships.

Active membership count shall not be treated as current occupancy.

### 4.6 Study Plan Management

- Owners shall create one or more study plans.
- Each plan shall have a custom name.
- Each plan shall have configurable access start and end times.
- Plans shall support overnight time ranges where compatible with library operating hours.
- Plans may be activated or deactivated.
- A library must have at least one active plan before creating new memberships.
- The system shall validate student access against the assigned study plan.
- Students shall not be considered eligible for a different plan unless their membership permits it.

### 4.7 Pricing Management

- Owners shall configure prices for each study plan and membership duration.
- Supported durations shall include monthly, quarterly, yearly, and custom durations.
- Custom durations may include 15 days or 6 months.
- The owner may define individual student price overrides.
- Staff may submit price override requests.
- Owner approval shall be required before a staff-requested override is applied.
- The system shall retain standard price, agreed price, adjustment, reason, approving user, and effective period.
- Existing memberships shall retain their agreed price and terms after standard pricing changes.

### 4.8 Staff Management

- Owners shall create, update, activate, and deactivate staff accounts.
- Owners shall assign predefined permission templates or configure permissions individually.
- Backend authorization shall enforce assigned permissions.
- Staff shall only access their own library's records.
- Owner-only operations shall remain protected.

### 4.9 Student / Member Management

Owners and authorized staff shall be able to create, view, search, and update student records.

V1 student profile fields:

| Field | Requirement |
|---|---|
| Full name | Required |
| Mobile number | Required |
| Email | Optional |
| Address | Optional |
| Emergency contact | Optional |
| Gender | Optional |
| Date of birth | Optional |
| Photograph | Optional |
| Government identification | Not collected in V1 |

Aadhaar shall not be collected in V1.

Sensitive information shall be protected with appropriate access restrictions and privacy controls.

### 4.10 Membership Management

- Authorized users shall create memberships for students.
- Each membership shall reference a student, library, and study plan.
- Membership records shall contain start date, end date, price, duration, and terms.
- Supported durations shall include monthly, quarterly, yearly, and custom.
- Memberships may be unpaid, partially paid, or fully paid.
- Membership activation shall follow the selected start date.
- Membership status shall be updated automatically according to dates.
- Authorized users may make corrections with appropriate audit records.
- A student may have multiple active memberships for different study plans.
- The system shall prevent conflicting memberships for the same study plan unless explicitly permitted by the owner.

#### 4.10.1 Renewal

- Every renewal shall create a new membership record.
- The new record shall reference the previous membership.
- Historical membership records shall remain unchanged.
- The new membership shall retain its own dates, plan, price, and terms.
- Early renewal shall support two options:
  1. Start immediately.
  2. Start after the existing membership expires.
- The user creating the renewal shall select the applicable option.
- Renewal history shall be available for reporting and auditing.

#### 4.10.2 Expiry

- Membership expiry shall be automatic based on the end date.
- Authorized users may correct membership status when justified.
- Manual corrections shall require appropriate authorization and audit information.

### 4.11 Attendance Management

V1 shall support manual and QR-code attendance.

#### Manual attendance

- Authorized staff shall record check-in and check-out.
- Attendance shall be linked to a student and library.
- Attendance records shall include timestamps and recording user.
- Multiple attendance sessions on the same day shall be supported.
- Duplicate active check-ins shall be prevented.

#### QR attendance

- Each student shall have a unique QR code.
- Authorized staff shall scan the student's QR code.
- QR scans shall be validated by the backend.
- QR attendance shall be associated with the correct student and library.
- Duplicate active check-ins shall be prevented.
- QR scanning shall support the attendance check-in/check-out workflow.
- QR attendance events shall be auditable.

#### Attendance corrections

- Owners and authorized staff may correct attendance.
- A correction reason shall be required.
- Corrections shall retain the original record and an audit trail.
- The system shall not silently overwrite attendance history.

### 4.12 Financial Management

The system shall maintain a separate financial ledger for each student/member account.

Supported operations:
- Membership charges.
- Payments.
- Advance deposits.
- Partial payments.
- Discounts.
- Additional charges.
- Credits and adjustments.
- Refunds.
- Outstanding balances.

Supported V1 payment methods:
- Cash.
- UPI.
- Bank transfer.

Each transaction shall record:
- Student/member reference.
- Transaction type.
- Amount.
- Transaction date.
- Payment method, where applicable.
- Reference or receipt number, where applicable.
- Recording user.
- Notes or reason.

Balances shall be calculated from ledger transactions. Direct balance overwrites shall not be allowed.

#### Refund approval

- Staff may submit refund requests.
- Owner approval shall be required before a refund is finalized.
- Refund requests and approvals shall be auditable.

#### Financial separation

Two separate financial domains shall exist:

1. BookNest subscription billing — payments made by library owners to BookNest.
2. Student financial ledger — payments and charges between students and libraries.

These shall not share transaction records or balances.

### 4.13 Public Library Discovery

Visitors shall be able to search and discover public libraries.

V1 search filters shall include:
- City and area.
- Distance.
- Price range.
- Available study plans.
- Facilities.
- Operating hours.

Public profiles shall display approved information, facilities, hours, available plans, and contact details.

Visitors may reveal the contact number and contact the library directly.

No appointment scheduling or booking shall be supported in V1.

### 4.14 BookNest Subscription Management

- Owner registration shall immediately start a 30-day free trial.
- Planned subscription durations shall include monthly, quarterly, yearly, and five-year options.
- Subscription payments shall support manual payment verification and online payment gateway integration.
- The system shall track subscription start date, end date, payment status, and subscription status.
- A seven-day grace period shall apply after subscription expiry.
- After the grace period, the library shall enter read-only access.
- Read-only access shall allow viewing and exporting permitted existing records but shall restrict data-changing operations.
- Subscription billing shall remain separate from student financial records.

### 4.15 Reports

V1 shall provide:

1. Student/member list.
2. Active memberships.
3. Expired memberships.
4. Membership renewal history.
5. Daily attendance.
6. Monthly attendance.
7. Daily collections.
8. Monthly collections.
9. Outstanding balances.
10. Payment history.
11. Occupancy information based on available attendance records.

Reports shall be appropriately filtered by tenant and user permissions.

### 4.16 Audit and Notifications

- Important actions shall be auditable.
- Audit records shall capture actor, action, affected record, timestamp, and relevant reason.
- Financial transactions, refunds, price overrides, membership changes, attendance corrections, and capacity overrides shall be audited.
- Notifications may be generated for membership expiry, renewal, and BookNest subscription events.
- Notification channels and templates shall be defined during detailed design.

---

## 5. Non-Functional Requirements

### 5.1 Security

- Secure authentication and authorization.
- Tenant isolation.
- Backend validation.
- Secure password hashing.
- Protection against common web application vulnerabilities.
- Sensitive data protection.
- No secrets or sensitive personal information in logs.

### 5.2 Performance

- Common management operations shall respond promptly under expected V1 usage.
- Public search shall support pagination.
- Database queries shall use appropriate indexes.
- Tenant-scoped queries shall be efficient.

### 5.3 Reliability and Data Integrity

- Financial transactions shall be consistent and auditable.
- Membership renewals shall preserve historical records.
- Multi-document financial operations shall use appropriate database transactions.
- Backups shall be maintained.
- Failed operations shall not leave inconsistent financial or membership records.

### 5.4 Maintainability

- Use a modular monolith architecture.
- Separate business logic from HTTP controllers.
- Use shared types and validation where appropriate.
- Maintain automated tests.
- Keep architecture and requirements documentation updated.

### 5.5 Scalability

- Support multiple independent library tenants.
- Maintain logical tenant isolation.
- Allow future student accounts, multiple branches, and book management.

### 5.6 Privacy

- Collect only necessary personal information.
- Aadhaar shall not be collected in V1.
- Restrict access to sensitive student information.
- Apply appropriate retention and deletion policies.

---

## 6. Technical Constraints and Proposed Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB, Mongoose |
| API | REST |
| Validation | Zod |
| Routing | React Router |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Testing | Vitest / Jest, Supertest, React Testing Library |
| Repository | npm workspaces monorepo |

Architecture: modular monolith.

---

## 7. Data and Multi-Tenancy Requirements

- Tenant-owned entities shall include tenant/library association.
- Backend authorization shall enforce tenant boundaries.
- All relevant queries shall be tenant-scoped.
- Cross-tenant access shall be covered by automated tests.
- Financial transactions shall retain an auditable history.
- Membership renewals shall create linked records.
- Historical membership pricing shall remain unchanged.
- Capacity shall be stored at library level.
- One owner shall manage one library in V1.
- Each library shall have its own configured time zone.

---

## 8. Acceptance Criteria

V1 shall be accepted when:

1. Owners can register and manage one library.
2. A 30-day trial starts immediately after registration.
3. Owners can configure library profiles and operating hours.
4. Overnight schedules work correctly.
5. Each library can configure one total capacity.
6. Capacity warnings and owner overrides work.
7. Owners can create study plans and configure pricing.
8. Staff permissions are configurable and enforced.
9. Student profiles can be created with the approved fields.
10. Memberships support the approved durations and payment states.
11. Membership renewals create linked records without overwriting history.
12. Multiple active memberships for different study plans are supported.
13. Membership expiry is automatic.
14. Manual and QR attendance support check-in and check-out.
15. Duplicate active check-ins are prevented.
16. Attendance corrections are audited.
17. Financial transactions support payments, advances, partial payments, charges, credits, and refunds.
18. Refund requests require owner approval.
19. Public visitors can search libraries using the approved filters.
20. All approved reports are available.
21. BookNest subscription billing is separate from student financial records.
22. Subscription expiry and read-only access rules are enforced.
23. Tenant isolation is verified through automated tests.
24. Important business actions are auditable.

---

## 9. Final V1 Decision Register

All product-level decisions reviewed during SRS preparation are approved and incorporated into this document.

| Decision area | Approved V1 rule |
|---|---|
| Capacity | One total library capacity; warn and permit owner override |
| Multiple active memberships | Different study plans allowed |
| Membership activation | Selected start date |
| Early renewal | Immediate or after existing expiry |
| Expiry | Automatic, with audited correction |
| QR attendance | Unique student QR scanned by staff |
| Attendance | Check-in and check-out |
| Duplicate check-in | Prevent duplicate active sessions |
| Attendance correction | Authorized staff/owner, reason required |
| Staff permissions | Individual permissions and templates |
| Student fields | All specified profile fields |
| Aadhaar | Not collected |
| Price override | Owner approval for staff requests |
| Student payment methods | Cash, UPI, bank transfer |
| Partial payment | Supported, including advance deposits |
| Refunds | Owner approval |
| Trial | Starts at registration |
| Grace period | Seven days |
| Post-expiry access | Read-only |
| Subscription payment | Manual and online gateway |
| Public search | All specified filters |
| Reports | All specified reports |
| Overnight study plans | Supported within library operating hours |
| Study-plan access | Enforced |
| Time zone | Configurable per library |
| Multiple branches | Excluded from V1 |

---

## 10. Document Approval

**Document version:** 1.2  
**Scope:** BookNest V1  
**Product-level open decisions:** None from the reviewed decision register.  
**Status:** Ready for formal approval.

The next phase is High-Level Design (HLD), followed by module-level Low-Level Design (LLD). Technical details and implementation rules will be documented in those design documents without silently changing the approved V1 product scope.