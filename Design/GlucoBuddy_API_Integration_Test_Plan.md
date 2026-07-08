# GlucoBuddy API Integration Test Plan

## Goal

Implement end-to-end API integration tests using Jest and Supertest to
verify routing, middleware, authentication, controllers, database
interaction and HTTP responses.

------------------------------------------------------------------------

# Progress

## ✅ Phase 1 --- Project Setup (Complete)

-   [x] Installed Supertest
-   [x] Split Express into `app.js` and `server.js`
-   [x] Created dedicated PostgreSQL test database (`glucobuddy_test`)
-   [x] Created `.env.test`
-   [x] Configured environment switching via `NODE_ENV`
-   [x] Configured Jest for the test environment
-   [x] Verified API startup

## ✅ Phase 2 --- Test Infrastructure (Complete)

-   [x] Added `tests/setup.js`
-   [x] Automatic database cleanup before every test
-   [x] Switched cleanup to `TRUNCATE ... RESTART IDENTITY CASCADE`
-   [x] Graceful PostgreSQL shutdown after tests
-   [x] Created first integration test (`health.test.js`)
-   [x] Existing unit tests still passing (88/88)

------------------------------------------------------------------------

# Remaining Work

## ⏳ Phase 3 --- Authentication API

-   Register
-   Duplicate email
-   Validation
-   Login
-   JWT authentication
-   `/api/auth/me`
-   Delete account

## ⏳ Phase 4 --- Glucose API

-   CRUD
-   Validation
-   Authentication

## ⏳ Phase 5 --- Insulin API

-   CRUD
-   Validation
-   Authentication

## ⏳ Phase 6 --- Settings API

-   Get/update settings
-   Validation

## ⏳ Phase 7 --- Dose API

-   Recommendation endpoint
-   Validation
-   Authentication

## ⏳ Phase 8 --- Adaptive API

-   Toggle
-   Get params
-   Submit outcome
-   Reset
-   Pending outcome

## ⏳ Phase 9 --- Data API

-   Export
-   Import
-   Preview
-   Malformed backup

## ⏳ Phase 10 --- Reports API

-   Report generation
-   Empty datasets
-   Authentication

------------------------------------------------------------------------

# Current Status

  Area                               Status
  ---------------------------------- ------------
  Dose Engine Unit Tests             ✅
  Adaptive Engine Unit Tests         ✅
  Health Integration Test            ✅
  Authentication Integration Tests   ⏳ Next
  Remaining API Tests                ⏳ Pending

------------------------------------------------------------------------

# Success Criteria

-   Dedicated test database
-   Full endpoint coverage
-   Authentication middleware tested
-   Validation tested
-   Success and failure paths tested
-   CI-ready automated suite
