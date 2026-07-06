# GlucoBuddy API Integration Test Plan

## Goal

Implement end-to-end API integration tests using Jest and Supertest to
verify routing, middleware, authentication, controllers, database
interaction and HTTP responses.

## Phase 1 -- Project Setup

-   Install Supertest (`npm install --save-dev supertest`)
-   Split Express into `app.js` (exports app) and `server.js` (starts
    server)
-   Create a dedicated PostgreSQL test database
-   Run migrations against the test database only

## Phase 2 -- Test Infrastructure

-   Configure Jest helpers
-   Add database cleanup before each test
-   Create reusable authentication helpers
-   Create reusable seed functions

## Phase 3 -- Authentication

Create `tests/auth.api.test.js` - Register - Login - Duplicate email -
Invalid password - JWT protection - Missing fields

## Phase 4 -- Glucose API

Create `tests/glucose.api.test.js` - Create log - Retrieve logs - Delete
log - Invalid values - Authentication required

## Phase 5 -- Insulin API

Create `tests/insulin.api.test.js` - Create log - Retrieve logs - Delete
log - Validation - Authentication

## Phase 6 -- Settings API

Create `tests/settings.api.test.js` - Get settings - Update settings -
Invalid ratios - Invalid targets

## Phase 7 -- Dose API

Create `tests/dose.api.test.js` - Calculate recommendation - Invalid
input - Uses user settings - Authentication

## Phase 8 -- Adaptive API

Create `tests/adaptive.api.test.js` - Toggle adaptive mode - Get
adaptive parameters - Reset adaptive parameters - Submit outcome -
Pending outcome endpoint

## Phase 9 -- Data API

Create `tests/data.api.test.js` - Export backup - Import backup -
Preview import - Reject malformed data

## Phase 10 -- Reports API

Create `tests/reports.api.test.js` - Generate report - Empty dataset -
Authentication

## Success Criteria

-   Dedicated test database
-   All protected routes tested
-   Validation covered
-   Happy-path and failure-path responses tested
-   Existing unit tests continue to pass

## Suggested Order

-   [ ] Install Supertest
-   [ ] Split app/server
-   [ ] Configure test database
-   [ ] Configure Jest helpers
-   [ ] Authentication tests
-   [ ] Glucose API tests
-   [ ] Insulin API tests
-   [ ] Settings API tests
-   [ ] Dose API tests
-   [ ] Adaptive API tests
-   [ ] Data API tests
-   [ ] Report API tests
