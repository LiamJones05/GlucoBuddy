# GlucoBuddy

## Modern Diabetes Management Platform

GlucoBuddy is a full-stack diabetes-management web application focused on glucose tracking, insulin dose calculation, analytics, adaptive recommendations, and long-term glucose insights.

The project is a mobile-first Progressive Web Application (PWA) with a React frontend, Node.js/Express API, and PostgreSQL persistence layer. It is educational decision-support software, not a replacement for clinical advice or treatment.

---

## Screenshots

> UI screenshots and demos coming soon.

---

# Features

## Authentication & User Management

- JWT-based authentication
- Secure password hashing with bcrypt
- Protected application routes
- Account deletion flow with password verification
- Rate-limited authentication endpoints
- Personalized diabetes settings per user

---

## Glucose Logging

- Log glucose readings with date and time
- Daily glucose history review
- Interactive glucose charting
- Target range overlays
- Combined glucose and insulin-on-board (IOB) review
- Separate IOB chart segments for separated insulin-dose windows

---

## Insulin Logging

- Log insulin doses and insulin type
- Time-based insulin history
- Confirm administered recommendations
- Optional glucose logging during insulin confirmation

---

## Insulin Dose Calculator

The insulin recommendation engine supports:

- Carbohydrate coverage
- Correction insulin
- Insulin on board (IOB)
- Protein adjustments
- Fat adjustments
- Alcohol reductions
- Exercise reductions
- Time-of-day insulin sensitivity
- CGM trend adjustments

### Supported CGM Trends

| Trend | Adjustment |
|---|---|
| Rising fast | +20% |
| Rising slowly | +10% |
| Steady | No adjustment |
| Falling slowly | -10% |
| Falling fast | -20% |

### Safety Behaviors

- Hypoglycemia protection below 4.0 mmol/L
- Dose clamping to prevent negative insulin values
- Conservative rounding to nearest 0.5 units
- IOB applied only to correction insulin
- Active IOB from overlapping doses is summed before being shown on the chart
- Safety-focused recommendation wording

---

## Analytics Dashboard

- 14-day, 30-day, and 90-day analytics windows
- Average glucose tracking
- Time-in-range analysis
- Time-above-range analysis
- Time-below-range analysis
- Standard deviation
- Coefficient of variation
- Clinical status indicators
- Comparative trend analysis
- Time-of-day glucose averages
- Data quality warnings
- Pattern-based insights
- Short-term glucose prediction

---

## Pattern-Based Insights

The insight engine identifies recurring glucose and insulin patterns including:

- Time-of-day highs
- Time-of-day lows
- Post-insulin low patterns
- Weak correction patterns
- Frequent hyperglycemia patterns
- Significant time-of-day deviation

Insights include:

- High, moderate, or low risk categorisation
- Confidence indicators
- Supporting event counts
- Risk-first ordering, then confidence and recency

---

## Adaptive Insulin Recommendation Engine

GlucoBuddy includes an optional adaptive recommendation system designed to conservatively tune insulin parameters over time.

### Adaptive System Features

- Exponential moving average updates
- Minimum evidence thresholds
- Dead-band stabilization logic
- Bounded parameter drift
- Separate morning/afternoon/evening adaptation
- Hypoglycemia learning freeze protection
- User-controlled enable/disable support
- Adaptive parameter reset support

### Adaptive Safety Positioning

Adaptive recommendations are:
- Optional
- User-controlled
- Conservative
- Relative to user-configured baselines

The system is designed as educational decision-support tooling and not autonomous medical treatment software.

---

## Clinical PDF Reports

- Generate downloadable clinical summary reports
- Configurable date ranges
- Trend chart generation
- Analytics summaries
- Insight summaries
- Episode summaries

---

## Backup & Restore

- Export complete user data to JSON
- Import preview support
- Full data restore workflows
- Transactional replacement handling
- User confirmation safeguards

---

# Technology Stack

## Frontend

- React 19
- Vite
- React Router
- Axios
- Recharts
- Framer Motion
- Lucide React

## Backend

- Node.js
- Express 5
- PostgreSQL (`pg`)
- JWT authentication
- bcrypt
- zod validation
- express-rate-limit
- Jest and Supertest integration testing

## Database

- PostgreSQL
- SQL schema and `node-pg-migrate` migrations
- Indexed user/date query paths

---

# Architecture

## Repository Structure

```text
GlucoBuddy/
  glucobuddy-frontend/
    src/
      api/
      components/
      pages/
      styles/
      utils/

  glucobuddy-backend/
    controllers/
    migrations/
    middleware/
    routes/
    services/
    tests/
    utils/
    validators/
    db.js
    migration-config.js
    server.js
    schema.sql

  docker/
    postgres/
      01-create-test-db.sh

  docker-compose.yml
```

---

# Frontend Architecture

The frontend is a React single-page application using React Router for routing and Framer Motion for animated transitions.

## Public Routes

- `/`
- `/register`
- `/terms`
- `/privacy`

## Protected Routes

- `/analytics`
- `/log-glucose`
- `/calculator`
- `/settings`

`/dashboard` redirects to `/analytics`.

Authentication-aware routing is handled through reusable route wrappers:

- `PublicRoute.jsx`
- `ProtectedLayout.jsx`

---

# Backend Architecture

The backend uses a layered route/controller/service architecture.

## Route Groups

- `/api/auth`
- `/api/settings`
- `/api/glucose`
- `/api/insulin`
- `/api/meals`
- `/api/dose`
- `/api/reports`
- `/api/data`
- `/api/adaptive`

## Service Layer

The backend service layer includes:

- `doseEngine.js`
- `iobEngine.js`
- `metricsEngine.js`
- `insightEngine.js`
- `predictionEngine.js`
- `adaptiveEngine.js`
- `outcomeTracker.js`

---

# Database Model

Core tables include:

- `users`
- `user_settings`
- `glucose_logs`
- `insulin_logs`
- `meal_logs`
- `dose_calculations`

The database includes:
- user-owned relational data
- indexed date lookups
- adaptive-learning fields
- outcome-tracking support

---

# API Overview

## Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `DELETE /api/auth/account`

## Settings

- `GET /api/settings`
- `PUT /api/settings`

## Glucose

- `POST /api/glucose`
- `GET /api/glucose`
- `GET /api/glucose/averages`
- `GET /api/glucose/insights`

## Insulin

- `POST /api/insulin`
- `GET /api/insulin`

## Meals

- `POST /api/meals`
- `GET /api/meals`

## Dose

- `POST /api/dose/calculate`

## Reports

- `GET /api/reports/summary`

## Data Portability

- `GET /api/data/export`
- `POST /api/data/preview`
- `POST /api/data/import`

## Adaptive

- `GET /api/adaptive/params`
- `GET /api/adaptive/pending`
- `POST /api/adaptive/outcome`
- `POST /api/adaptive/toggle`
- `POST /api/adaptive/reset`

---

# Development Roadmap

The detailed current issue list is maintained in [ROADMAP.md](ROADMAP.md). Active themes include:

- Production hardening
- Clinical safety testing
- Adaptive engine testing
- Infrastructure and deployment
- Dockerization
- CI/CD
- Authentication improvements
- Accessibility improvements
- PWA support
- Offline support
- External CGM integrations

---

# Security & Safety Notes

GlucoBuddy is designed as an educational diabetes-management support platform.

Important:
- Dose recommendations are estimates only
- Users should always verify recommendations independently
- Insulin ratios should be determined with healthcare professional guidance
- The application may produce incorrect calculations or predictions
- Users should consult healthcare professionals before making treatment decisions

Adaptive recommendations are disabled by default and require explicit user opt-in.

---

# Local Database Infrastructure

Docker Compose currently runs PostgreSQL only; the frontend and API run directly with their npm scripts during development.

On first initialisation of an empty `postgres_data` volume, Postgres creates:

- The development database named by root `.env` → `DB_DATABASE`
- A separate `glucobuddy_test` database via `docker/postgres/01-create-test-db.sh`

The init script runs only for a new Postgres volume. Backend migrations then initialise the schemas in both databases. Keep the test database separate: the test suite truncates its tables before each test.

Production application containers, reverse proxy/HTTPS, CI/CD, backups, and monitoring are not implemented yet.

---

# Future Goals

Planned future improvements include:

- Push notifications
- CGM integrations
- Improved explainability
- Expanded analytics
- Session management
- Refresh token authentication
- Accessibility improvements
- Advanced insight systems

---

# Local Development

## Prerequisites

- Node.js and npm
- Docker and Docker Compose

## 1. Configure environment files

Create a root `.env` for Docker Compose:

```env
DB_USER=
DB_PASSWORD=
DB_DATABASE=
```

Create `glucobuddy-backend/.env` for the development API/database and `glucobuddy-backend/.env.test` for tests. The test file must use a distinct database:

```env
# glucobuddy-backend/.env.test
DB_USER=
DB_PASSWORD=
DB_HOST=localhost
DB_DATABASE=glucobuddy_test
DB_PORT=5432
DB_SSL=false
JWT_SECRET=
ALLOWED_ORIGINS=
```

`JWT_SECRET` must be a strong, unique secret outside source control. `ALLOWED_ORIGINS` is a comma-separated list of browser origins allowed to call the API.

## 2. Start PostgreSQL

From the repository root:

```bash
docker compose up -d
```

For a newly created Docker volume, this creates the development database and `glucobuddy_test`. Do not point test configuration at the development database.

## 3. Set up the backend

```bash
cd glucobuddy-backend
npm install
npm run setup
npm run dev
```

`npm run setup` applies migrations to both the development and test databases. Use `npm run migrate:up` or `npm run migrate:test` to target one database.

## 4. Start the frontend

```bash
cd glucobuddy-frontend
npm install
npm run dev
```

## Tests and checks

Backend integration and engine tests require the Docker test database:

```bash
cd glucobuddy-backend
npm test
```

Frontend IOB regression tests and the production build can be run with:

```bash
cd glucobuddy-frontend
npm test
npm run build
npm run lint
```

### Browser-representative API integration tests

Integration tests should use payload types that the browser can actually send. In particular, values read from HTML number inputs are strings unless the frontend converts them first. Use numeric strings in API integration tests for form-backed numeric fields, and keep backend schemas resilient with `z.coerce.number()`.

---

# API Health Check

With the backend running, `GET /` returns a simple API-status response.

---

# Environment Variables

Environment files are intentionally excluded from version control. See the Local Development section for the required root Compose variables and backend test variables. The backend development `.env` uses the same database fields, plus `PORT`, `JWT_SECRET`, and `ALLOWED_ORIGINS`.

---

# Status

GlucoBuddy is in active development and is not production-ready.

Current verification status:

- Backend: 12 Jest suites and 178 tests passing
- Frontend: IOB regression tests and production build passing
- Frontend lint: known outstanding lint errors remain

---

# License

License to be determined.
