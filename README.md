# GlucoBuddy

## Modern Diabetes Management Platform

GlucoBuddy is a full-stack diabetes management web application focused on glucose tracking, insulin dose calculation, analytics, adaptive recommendations, and long-term diabetes insights.

The project is designed as a mobile-first Progressive Web Application (PWA) with a modern React frontend, Node.js backend, and PostgreSQL persistence layer.

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
- Combined glucose and insulin review views

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
- Confidence indicators
- Supporting event counts
- Trend summaries

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

## Database

- PostgreSQL

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
    middleware/
    routes/
    services/
    utils/
    validators/
    db.js
    server.js
    schema.sql

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

Current roadmap focus areas include:

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

# Planned Infrastructure

Planned deployment architecture includes:

- React frontend
- Node.js API backend
- PostgreSQL database
- Dockerized deployment
- Nginx reverse proxy
- HTTPS support
- Automated backups
- CI/CD pipelines
- Monitoring and observability

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

## Frontend

```bash
cd glucobuddy-frontend
npm install
npm run dev
```

## Backend

```bash
cd glucobuddy-backend
npm install
npm run dev
```

---

# Environment Variables

Example backend environment variables:

```env
PORT=
JWT_SECRET=

DB_USER=
DB_PASSWORD=
DB_HOST=
DB_DATABASE=
DB_PORT=
DB_SSL=
```

---

# Status

GlucoBuddy is currently in active development and progressing toward production readiness.

Current focus areas:
- testing
- deployment hardening
- infrastructure
- authentication improvements
- operational reliability

---

# License

License to be determined.

