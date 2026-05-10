# GlucoBuddy Technical and Feature Breakdown

## 1. Overview

GlucoBuddy is a full-stack diabetes management web application. It supports user authentication, personalised diabetes settings, glucose logging, insulin logging, insulin dose calculation, analytics, clinical report generation, backup/restore, and adaptive insulin recommendation tuning.

The repository is organised into two main applications:

- `glucobuddy-frontend`: React and Vite frontend.
- `glucobuddy-backend`: Node.js and Express backend API.

The application persists data in Microsoft SQL Server.

## 2. Technology Stack

### Frontend

- React 19
- Vite
- React Router
- Axios
- Recharts
- Framer Motion
- Lucide React
- CSS modules/files by page and feature

### Backend

- Node.js
- Express 5
- Microsoft SQL Server via `mssql`
- JWT authentication
- bcrypt password hashing
- zod validation
- dotenv environment configuration

### Database

- Microsoft SQL Server
- Main schema file: `glucobuddy-backend/schema.sql`

## 3. Repository Structure

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
  Design/
  Problems-Queue/
```

## 4. Frontend Architecture

The frontend is a React single-page application. Routing is defined in `glucobuddy-frontend/src/App.jsx`.

### Public Routes

- `/`: Login page.
- `/register`: Registration page.
- `/terms`: Terms page.
- `/privacy`: Privacy page.

### Protected Routes

- `/analytics`: Main analytics dashboard.
- `/log-glucose`: Glucose logging and daily charting.
- `/calculator`: Insulin dose calculator.
- `/settings`: User settings, backup/restore, adaptive settings, and account management.

The old `/dashboard` route redirects to `/analytics`.

### Authentication Handling

The frontend stores the JWT in `localStorage`. The shared Axios instance in `glucobuddy-frontend/src/api/api.js` automatically attaches the token to requests:

```text
Authorization: Bearer <token>
```

If an API request returns `401`, the token is removed and the user is redirected to the login page.

## 5. Backend Architecture

The backend starts from `glucobuddy-backend/server.js`.

Mounted route groups:

- `/api/auth`
- `/api/settings`
- `/api/glucose`
- `/api/insulin`
- `/api/meals`
- `/api/dose`
- `/api/reports`
- `/api/data`
- `/api/adaptive`

The backend follows a route/controller/service structure:

- `routes/`: Express route definitions.
- `controllers/`: Request handling and database orchestration.
- `services/`: Domain logic such as dose calculations, analytics, reports, predictions, and adaptive learning.
- `validators/`: zod schemas for request validation.
- `middleware/`: auth, validation, and error handling.
- `utils/`: date/time handling and reusable helpers.

## 6. Database Model

The schema file defines these core tables:

- `Users`
- `UserSettings`
- `GlucoseLogs`
- `InsulinLogs`
- `MealLogs`
- `DoseCalculations`

Most tables are user-owned with `user_id` foreign keys. User deletion cascades through related tables where foreign key constraints are present.

### Important Schema Drift

The current code expects columns that are not present in the checked-in `schema.sql` file:

- `UserSettings.adaptive_enabled`
- `UserSettings.adaptive_params`
- `DoseCalculations.confirmed_administered`

This means a fresh setup from `schema.sql` may fail unless migrations exist elsewhere or the live database has already been manually updated.

## 7. Implemented Features

### User Authentication

Implemented in:

- `glucobuddy-backend/controllers/authController.js`
- `glucobuddy-backend/routes/auth.js`
- `glucobuddy-backend/middleware/authMiddleware.js`

Features:

- Register user.
- Login user.
- Hash passwords with bcrypt.
- Issue JWTs with a 7-day expiry.
- Fetch current user details.
- Delete account after password verification.
- Create default diabetes settings during registration.

### User Settings

Implemented in:

- `glucobuddy-backend/controllers/settingsController.js`
- `glucobuddy-frontend/src/pages/Settings.jsx`

Settings include:

- Correction ratio.
- Target glucose minimum.
- Target glucose maximum.
- Morning carb ratio.
- Afternoon carb ratio.
- Evening carb ratio.

These settings are used by dose calculations, analytics, target-range displays, and adaptive logic.

### Glucose Logging

Implemented in:

- `glucobuddy-backend/controllers/glucoseController.js`
- `glucobuddy-frontend/src/pages/GlucoseLogging.jsx`

Features:

- Add glucose readings with date and time.
- View readings by selected date.
- Display glucose data in a chart.
- Overlay user target range.
- Combine glucose data with insulin activity for daily review.

### Insulin Logging

Implemented in:

- `glucobuddy-backend/controllers/insulinController.js`
- `glucobuddy-frontend/src/api/services/insulinService.js`

Features:

- Log insulin dose amount.
- Store insulin type.
- Store date and time.
- Query insulin logs by date.
- Confirm a recent dose calculation as administered.
- Optionally log glucose at the same time as insulin confirmation.

### Insulin Dose Calculator

Implemented in:

- `glucobuddy-backend/controllers/doseController.js`
- `glucobuddy-backend/services/doseEngine.js`
- `glucobuddy-backend/services/iobEngine.js`
- `glucobuddy-frontend/src/pages/Calculator.jsx`

The calculator considers:

- Current glucose.
- Carbohydrate intake.
- User target range.
- Time-specific insulin-to-carb ratio.
- Correction ratio.
- Insulin on board.
- Protein.
- Fat.
- Alcohol.
- Recent exercise.
- Planned exercise.
- Time-of-day sensitivity multiplier.
- Optional CGM trend adjustment on the frontend.

Core calculation:

```text
Recommended dose =
  carb coverage
  + correction dose
  + protein adjustment
  + fat adjustment
  - insulin on board applied to correction
  - alcohol reduction
  - recent exercise reduction
  - planned exercise reduction
```

Safety behaviour:

- If glucose is below `4.0 mmol/L`, the backend returns a hypo warning and recommends `0` units.
- The final backend dose is clamped to zero or above.
- The backend rounds to the nearest 0.5 units.
- Insulin on board is applied only to correction insulin, not meal coverage.

### Analytics Dashboard

Implemented in:

- `glucobuddy-frontend/src/pages/Dashboard.jsx`
- `glucobuddy-backend/controllers/glucoseController.js`
- `glucobuddy-backend/services/metricsEngine.js`
- `glucobuddy-backend/services/insightEngine.js`
- `glucobuddy-backend/services/predictionEngine.js`

Features:

- 14-day, 30-day, and 90-day analytics windows.
- Average glucose.
- Time in range.
- Time below range.
- Time above range.
- Standard deviation.
- Coefficient of variation.
- Hypo count.
- Hyper count.
- Previous-period comparison.
- Two-hour time-of-day glucose averages.
- Highest average time interval indicator.
- Data quality warnings.
- Pattern-based insights.
- Short-term glucose prediction.

### Pattern-Based Insights

The insight engine identifies recurring patterns and risks from glucose and insulin data.

Implemented insight categories include:

- Time-of-day highs.
- Time-of-day lows.
- Post-insulin low patterns.
- Weak correction patterns.
- Frequent high glucose patterns.
- Significant time-of-day deviation.

Insights include confidence and supporting event counts.

### Prediction

Implemented in `glucobuddy-backend/services/predictionEngine.js`.

The prediction engine uses recent glucose movement and insulin context to estimate near-future glucose points. The dashboard displays the latest predicted glucose where available.

### Clinical PDF Reports

Implemented in:

- `glucobuddy-backend/controllers/reportController.js`
- `glucobuddy-backend/services/reportData.js`
- `glucobuddy-frontend/src/utils/reportChart.js`
- `glucobuddy-frontend/src/utils/reportPdf.js`

Features:

- Select start and end date.
- Maximum report range of 90 inclusive days.
- Generate report summary from backend.
- Render chart image on frontend.
- Generate downloadable PDF from frontend canvas/PDF utilities.
- Include metrics, insights, glucose trends, and episode summaries.

### Backup and Restore

Implemented in:

- `glucobuddy-backend/controllers/dataController.js`
- `glucobuddy-frontend/src/pages/Settings.jsx`

Features:

- Export user data to JSON.
- Include user metadata, settings, glucose logs, insulin logs, meal logs, and dose calculations.
- Preview import before applying.
- Show import counts and date range.
- Transactionally clear and replace existing user log data during import.

### Adaptive Insulin Recommendation Engine

Implemented in:

- `glucobuddy-backend/controllers/adaptiveController.js`
- `glucobuddy-backend/services/adaptiveEngine.js`
- `glucobuddy-backend/services/outcomeTracker.js`
- `glucobuddy-frontend/src/components/AdaptiveSettings.jsx`
- `glucobuddy-frontend/src/components/OutcomePromptCard.jsx`

The adaptive system:

- Seeds adaptive values from the user's current manual settings.
- Tracks post-dose glucose outcomes.
- Uses exponential moving average updates.
- Adjusts morning, afternoon, and evening carb ratios separately.
- Adjusts correction factor.
- Requires minimum evidence before changing parameters.
- Uses a dead band to avoid unnecessary changes.
- Caps maximum drift from baseline settings.
- Freezes learning after hypoglycaemia.
- Allows adaptive mode toggle.
- Allows adaptive parameter reset.

## 8. API Surface Summary

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `DELETE /api/auth/account`

### Settings

- `GET /api/settings`
- `PUT /api/settings`

### Glucose

- `POST /api/glucose`
- `GET /api/glucose`
- `GET /api/glucose/averages`
- `GET /api/glucose/insights`

### Insulin

- `POST /api/insulin`
- `GET /api/insulin`

### Meals

- `POST /api/meals`
- `GET /api/meals`

### Dose

- `POST /api/dose/calculate`

### Reports

- `GET /api/reports/summary`

### Data Portability

- `GET /api/data/export`
- `POST /api/data/preview`
- `POST /api/data/import`

### Adaptive

- `GET /api/adaptive/params`
- `GET /api/adaptive/pending`
- `POST /api/adaptive/outcome`
- `POST /api/adaptive/toggle`
- `POST /api/adaptive/reset`

