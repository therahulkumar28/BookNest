# BookNest --- High-Level Design (HLD)

**Document ID:** BOOKNEST-HLD\
**Version:** 1.0\
**Status:** Architecture baseline --- pending formal sign-off\
**Last updated:** 12 November 2026

## 1. Purpose

This document describes the high-level technical architecture of
BookNest. It translates the approved BookNest SRS into an overall
technical structure and acts as the reference for detailed Low-Level
Design (LLD).

It covers system architecture, technology choices, modules, tenancy,
data boundaries, APIs, security, testing, deployment and future
extensibility.

## 2. Product overview and business model

BookNest is a multi-tenant SaaS platform for independent libraries and
study spaces.

It provides: - A management application for library owners and
authorized staff. - A public discovery website where visitors can browse
libraries, view facilities, hours, study plans and prices, reveal
contact details, and contact libraries directly.

BookNest subscription fees and student-to-library payments are separate
financial domains: 1. Library owner pays BookNest for the SaaS
subscription. 2. Student pays their library for membership and other
library charges.

Students do not have login accounts in V1. Library staff create and
manage student records and memberships.

## 3. V1 scope

### Included

-   Platform administration and owner onboarding.
-   One owner account managing one library.
-   Staff accounts and permissions.
-   Library profile, facilities, operating hours and capacity.
-   Study plans and pricing.
-   Student records.
-   Membership creation, renewal and expiry.
-   Manual and QR-based attendance.
-   Student financial ledger.
-   BookNest SaaS subscription management.
-   Public library discovery.
-   Reports, audit history and notifications.

### Excluded

-   Student login or self-service portal.
-   Online student membership registration.
-   Appointment booking or seat reservation.
-   Book catalogue, inventory, borrowing, issue/return or book
    reservations.
-   Automated bank/payment-gateway verification for V1 payments.

The architecture should allow future additions without redesigning core
entities and financial boundaries.

## 4. Technology stack

  Layer                Technology
  -------------------- --------------------------------
  Frontend             React + TypeScript
  Build tool           Vite
  Styling              Tailwind CSS
  Backend              Node.js + Express + TypeScript
  Database             MongoDB + Mongoose
  API                  REST
  Validation           Zod
  Frontend routing     React Router
  Server state         TanStack Query
  Forms                React Hook Form
  Frontend tests       Vitest + React Testing Library
  Backend tests        Jest or Vitest + Supertest
  Code quality         ESLint + Prettier
  Package management   npm workspaces

Exact dependency versions are controlled by the repository package
files.

## 5. Architecture style

BookNest uses a **modular monolith**: - One frontend application. - One
backend application. - One primary MongoDB database. - Backend modules
separated by business responsibility.

We will not introduce microservices, Kubernetes or message brokers for
V1. A modular monolith is simpler to build, test, deploy and debug.
Modules can be extracted later if scale and operational needs justify
it.

### 5.1 Logical architecture

``` text
Public visitors / Owners / Staff
              |
              v
     React + TypeScript Web
              |
           HTTPS
              |
              v
       Node.js + Express API
              |
    Authentication / Tenant Context
              |
       Business Modules
              |
              v
            MongoDB
```

The diagram represents logical responsibilities, not separate deployed
services.

## 6. Repository architecture

The project uses an npm workspaces monorepo.

``` text
BookNest/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── features/
│   │       ├── hooks/
│   │       ├── layouts/
│   │       ├── services/
│   │       ├── routes/
│   │       ├── utils/
│   │       └── types/
│   └── api/
│       └── src/
│           ├── config/
│           ├── modules/
│           ├── middleware/
│           ├── database/
│           ├── shared/
│           ├── routes/
│           ├── app.ts
│           └── server.ts
├── packages/
│   └── shared/
│       └── src/
├── docs/
│   ├── requirements/
│   ├── hld/
│   ├── lld/
│   ├── architecture/
│   └── decisions/
├── package.json
└── package-lock.json
```

### 6.1 Frontend responsibilities

-   Render pages and components.
-   Handle user interactions and client-side navigation.
-   Perform basic client-side validation.
-   Call backend APIs and display results.
-   Manage UI state.

The frontend is not a security boundary and must not be trusted to
enforce permissions or business-critical rules.

### 6.2 Backend responsibilities

-   Authentication and authorization.
-   Tenant identification and isolation.
-   Business rules and validation.
-   Database operations and transactions.
-   Financial calculations and ledger posting.
-   Membership and attendance enforcement.
-   Audit logging and notifications.

The backend is the source of truth.

### 6.3 Shared package

Contains reusable TypeScript types, enums, API contract types, constants
and suitable shared validation schemas. It must not contain database
access or secrets.

## 7. Backend modules

  Module             Responsibility
  ------------------ --------------------------------------------------
  Auth               Registration, login, sessions and authentication
  Platform Admin     Platform-level administration
  Tenant             Tenant context and isolation
  Library            Library profile and settings
  Staff              Staff accounts and permissions
  Study Plans        Study plans, time slots and access rules
  Pricing            Standard pricing and individual overrides
  Students           Student profiles
  Memberships        Creation, renewal, expiry and access
  Finance            Student charges, payments, refunds and balances
  Attendance         Check-in, check-out and QR validation
  Subscription       BookNest SaaS subscriptions
  Reports            Operational and financial reports
  Audit              Important activity history
  Notifications      Email and other future notifications
  Public Discovery   Public library search and profiles

Each module owns its business rules and exposes clear service
interfaces. Modules should not reach into another module's internal
implementation.

## 8. Roles

### Platform Admin

Manages platform-level operations, library accounts, SaaS subscription
plans, manual subscription-payment verification and authorized platform
reports.

### Library Owner

Manages their library, staff, study plans, pricing, students,
memberships, finances and reports. Approves sensitive staff requests.

### Librarian / Staff

Performs operations permitted by assigned permissions. Sensitive
operations may require owner approval.

### Student / Public Visitor

Has no authenticated account in V1. Can browse public library
information and contact libraries directly.

## 9. Multi-tenant architecture

Each library is an independent tenant.

V1 uses a shared MongoDB database and shared collections with a
`tenantId` on tenant-owned records.

One owner manages exactly one library in V1. A library may have multiple
staff members.

### Tenant isolation rules

1.  Authenticate the user.
2.  Resolve the user's authorized library/tenant on the backend.
3.  Apply trusted tenant scope to every tenant-owned query.
4.  Verify related records belong to the same tenant.
5.  Reject cross-tenant reads and writes.
6.  Never trust a frontend-supplied tenant ID as proof of authorization.

Tenant isolation must have dedicated automated tests.

## 10. Authentication and authorization

Authentication establishes identity; authorization determines permitted
actions.

The proposed design uses: - Secure password hashing. - Short-lived
access credentials. - Securely managed refresh sessions. - HTTP-only,
Secure and appropriately configured SameSite cookies where cookie-based
refresh sessions are used. - Role-based and permission-based backend
authorization.

The exact login identifier, verification requirements, token expiry,
rotation, CSRF protections and session schema are specified in the
Authentication LLD before implementation.

## 11. Database architecture

MongoDB with Mongoose is the persistence layer.

Major logical collections include:

  Collection            Purpose
  --------------------- ------------------------------------------
  users                 Owner, staff and platform admin accounts
  libraries             Library profiles and settings
  staffPermissions      Staff permission assignments
  studyPlans            Study plans and time slots
  pricingPlans          Standard prices
  priceOverrides        Individual price adjustments
  students              Student profiles
  memberships           Membership records and renewals
  attendanceSessions    Check-in and check-out records
  studentTransactions   Student financial ledger
  subscriptionPlans     BookNest subscription products
  tenantSubscriptions   Library SaaS subscription state
  paymentRecords        BookNest subscription payment records
  auditLogs             Important activity history
  notifications         Notification records

Exact schemas, indexes, uniqueness constraints, relationships and
deletion behavior belong in the LLD.

### 11.1 Transactions

Operations that require multiple related writes to succeed or fail
together must use MongoDB transactions where appropriate. Examples
include membership creation with its initial charge and posting a
payment with its ledger entry.

The MongoDB deployment must support transactions, typically through a
replica set or an appropriate managed deployment.

## 12. API architecture

REST APIs use the `/api/v1` prefix.

Proposed route groups:

``` text
/api/v1/auth
/api/v1/admin
/api/v1/library
/api/v1/staff
/api/v1/study-plans
/api/v1/pricing
/api/v1/students
/api/v1/memberships
/api/v1/attendance
/api/v1/finance
/api/v1/subscriptions
/api/v1/reports
/api/v1/public/libraries
```

The backend validates input, authenticates and authorizes protected
requests, enforces tenant scope, executes business logic and returns
consistent responses. Endpoint contracts are defined in the LLD.

## 13. Core business architecture rules

### Library operations and capacity

-   Each library configures its own time zone and operating hours by
    day.
-   Closed days and overnight hours are supported.
-   One total capacity applies to the whole library, not separately to
    each plan.
-   Occupancy is derived from attendance.
-   Capacity warnings are shown when full; authorized owner overrides
    require audit records.
-   No seat selection or reservation in V1.

### Study plans and membership

-   A library can define multiple study plans with names, durations,
    access rules, time windows and prices.
-   Overnight plans must be compatible with operating hours.
-   At least one active plan is required before membership creation.
-   Membership duration and plan access schedule are distinct concepts.
-   Membership starts on a selected start date.
-   Membership payment state and membership validity are separate.
-   Renewal creates a new linked membership record; historical records
    remain unchanged.
-   Existing memberships retain their agreed price and terms when
    standard pricing changes.
-   Multiple active memberships may exist for different plans, subject
    to conflict rules.

### Student finance and payments

-   Student financial activity is maintained in a ledger.
-   Supported V1 payment methods are **cash, UPI and bank transfer**.
-   A student may pay the library directly using its UPI ID/QR or pay
    cash directly to authorized library staff.
-   For UPI, staff manually checks the actual bank/UPI transaction
    before confirming the payment in BookNest.
-   For cash, the receiving staff member records receipt of cash in
    BookNest.
-   A pending UPI claim is not treated as a confirmed payment.
-   Duplicate transaction references must be checked.
-   Refunds requested by staff require owner approval.
-   Balances are derived from ledger entries and never directly
    overwritten.
-   Posted transactions are corrected through compensating entries, not
    silent edits.

### QR attendance

-   QR codes use opaque identifiers and must not expose personal data.
-   Staff authentication and backend membership/library validation are
    required.
-   Duplicate active check-ins are prevented.
-   Attendance corrections require authorization, reason and audit
    history.
-   QR generation and browser scanning use open-source libraries; no
    paid QR API is required.

### BookNest SaaS subscription

-   A 30-day trial begins after successful owner registration.
-   Planned terms: monthly, quarterly, yearly and five-year.
-   V1 subscription payments are manually verified by Platform Admin.
-   Seven-day grace period follows subscription expiry.
-   After grace, the tenant enters read-only mode: authorized
    viewing/export remains available, while data-changing operations are
    blocked.
-   Student ledger and BookNest subscription billing remain separate.

### Email and notifications

-   A central BookNest email service sends owner verification OTPs,
    password reset emails and library-specific student reminders.
-   The library's reply/contact address can be used as Reply-To where
    appropriate.
-   A dedicated BookNest sender account may be used for initial
    low-volume testing; a transactional email provider can replace it
    without changing module business logic.
-   Mobile OTP and WhatsApp messaging are excluded from V1 unless
    separately approved.

### Public discovery

-   Public filters include city/area, distance, price range, study
    plans, facilities and operating hours.
-   Coordinates can be stored and distance calculated by the backend
    initially, avoiding a mandatory paid maps API.
-   Public visitors can view profile details and contact the library
    directly.

## 14. Security architecture

-   Modern password hashing.
-   Secure session and refresh-token handling.
-   Backend permission checks.
-   Tenant isolation on all tenant-owned data.
-   Input validation and safe error responses.
-   Rate limiting for sensitive endpoints.
-   HTTPS in deployed environments.
-   Secrets stored outside source control.
-   Audit logging for sensitive operations.
-   Restricted access to personal information.
-   QR identifiers contain no personal data.
-   Backups and recovery procedures.

No government identification such as Aadhaar is collected in V1.

## 15. Audit architecture

Important actions record the actor, action, affected record, tenant,
timestamp and reason where applicable.

Audited operations include: - Financial transactions and refunds. -
Price overrides. - Membership changes. - Attendance corrections. -
Capacity overrides. - Permission changes. - Subscription payment
verification.

Audit records must be protected from ordinary user modification.

## 16. Reports

V1 reports: - Student/member list. - Active and expired memberships. -
Membership renewal history. - Daily and monthly attendance. - Daily and
monthly collections. - Outstanding balances. - Payment history. -
Occupancy based on attendance.

All tenant reports must be tenant-scoped.

## 17. Deployment architecture

``` text
Users
  |
 HTTPS
  |
  +------------------+
  |                  |
  v                  v
React Frontend    Express API
                     |
                     v
                  MongoDB
```

The hosting provider has not been selected.

Environments: - Development. - Staging. - Production.

Deployment requirements include HTTPS, secure environment configuration,
backups, monitoring, controlled database/index changes, CI/CD and
production access controls.

## 18. Testing strategy

-   Unit tests for business rules, calculations, membership validity,
    ledger balances and permission decisions.
-   Integration tests for APIs, database operations and workflows.
-   Tenant isolation tests for cross-tenant reads, updates and deletes.
-   End-to-end tests for onboarding, staff, students, memberships,
    payments, attendance and reports.
-   Security tests for authentication, authorization, validation and
    sensitive-data handling.

## 19. Future extensions

The architecture should allow future additions: - Student login and
self-service portal. - Online student payments. - Online appointment
scheduling. - Book catalogue and inventory. - Book issue/return and
reservations. - Multiple branches per owner. - Additional notification
channels. - Advanced analytics.

These are not part of V1 implementation.

## 20. Architecture decision register

  ------------------------------------------------------------------------
  ID                      Decision                 Status
  ----------------------- ------------------------ -----------------------
  HLD-001                 Modular monolith         Selected

  HLD-002                 React + TypeScript       Selected
                          frontend                 

  HLD-003                 Node.js + Express        Selected
                          backend                  

  HLD-004                 MongoDB + Mongoose       Selected

  HLD-005                 REST API                 Selected

  HLD-006                 Shared database with     Proposed
                          tenant identifiers       

  HLD-007                 One owner manages one    Approved in SRS
                          library in V1            

  HLD-008                 Backend-enforced tenant  Required
                          isolation                

  HLD-009                 Separate SaaS and        Required
                          student finance domains  

  HLD-010                 Separate development,    Proposed
                          staging and production   

  HLD-011                 MongoDB transaction      Required where needed
                          support for atomic       
                          operations               

  HLD-012                 Manual                   Approved design
                          UPI/cash/bank-transfer   direction
                          recording for student    
                          payments                 

  HLD-013                 Manual UPI verification  Approved design
                          for BookNest             direction
                          subscription payments    

  HLD-014                 Central BookNest email   Approved design
                          service                  direction
  ------------------------------------------------------------------------

Proposed decisions must be reviewed before being treated as final.

## 21. Glossary

  Term               Meaning
  ------------------ ------------------------------------------------------
  Tenant             An independent library using BookNest
  SaaS               Software as a Service
  HLD                High-Level Design
  LLD                Low-Level Design
  API                Application Programming Interface
  RBAC               Role-Based Access Control
  Ledger             A record of financial transactions
  Membership         A student's access agreement with a library
  Study Plan         A library-defined access schedule and pricing option
  Occupancy          Number of people currently present
  Modular Monolith   One application divided into logical modules

## 22. Related documents

-   `docs/requirements/BOOKNEST_SRS_V1.md`
-   `docs/lld/BOOKNEST_LLD_V1.md`
-   `docs/architecture/`
-   `docs/decisions/`

------------------------------------------------------------------------

**End of BookNest HLD V1.0**
