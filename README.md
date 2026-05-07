# GlucoBuddy

## Overview

GlucoBuddy is a full-stack diabetes management application designed to help users monitor blood glucose levels, calculate insulin doses, track insulin activity, and visualise glucose trends over time.

The application combines secure authentication, personalised diabetes configuration, insulin dose calculation logic, and interactive analytics into a responsive cross-device experience optimised for both desktop and mobile use.

The platform was developed as a final year Computer Science project and demonstrates practical implementation of:

- Full-stack web development
- REST API architecture
- Secure authentication
- SQL database integration
- Data visualisation
- Mobile-responsive UI design
- Progressive Web App (PWA) concepts

---

# Key Features

## Authentication & Security

- JWT-based authentication
- Secure password hashing using bcrypt
- Protected API routes
- Persistent authenticated sessions
- User-specific medical configuration storage

---

## Glucose Management

- Log blood glucose readings
- Record custom reading dates and times
- Visualise glucose readings on interactive charts
- Daily glucose trend analysis
- Configurable target glucose ranges
- Time-of-day glucose averaging

---

## Insulin Tracking

- Log insulin doses
- Track insulin activity over time
- Insulin-on-board (IOB) modelling
- Overlay insulin activity directly onto glucose charts

---

## Intelligent Dose Calculator

The application calculates recommended insulin doses using:

- Current blood glucose
- Carbohydrate intake
- Protein intake adjustments
- User-specific insulin-to-carb ratios
- Correction factors
- Insulin-on-board subtraction
- Exercise adjustments
- Safety validations for hypoglycaemia risk

### Dose Formula

```text
Total Dose = Carb Dose + Protein Dose + Fat Dose + Correction Dose 
- Insulin On Board (IOB) - Exercise Dose
```

### Calculation Components

- Carb Dose = Carbohydrates ÷ Carb Ratio
- Protein Dose = Protein
- Correction Dose = (Current Glucose - Target Mid-Range) ÷ Correction Factor
- IOB = Remaining active insulin from previous doses

---

# Analytics & Reporting

- Interactive glucose trend visualisations
- Average glucose by time of day
- Insulin activity graphs
- Clinical insight summaries
- Time-window filtering
- PDF clinical report generation

---

# Mobile Experience

GlucoBuddy includes a mobile-first responsive interface with:

- Fixed bottom navigation
- iOS-style UI behaviour
- Dark mode support
- Responsive chart rendering
- Touch-friendly controls
- Safe-area support for iPhone devices

---

# Technology Stack

## Frontend

- React
- Vite
- React Router
- Recharts
- Lucide React

## Backend

- Node.js
- Express.js
- JWT Authentication
- bcrypt

## Database

- Microsoft SQL Server

## Tooling & Infrastructure

- Docker
- ngrok
- PowerShell automation scripts

---

# System Architecture

```text
React Frontend
       ↓
Express API Backend
       ↓
SQL Server Database
```

---

# Database Structure

Main database tables include:

- Users
- UserSettings
- GlucoseLogs
- InsulinLogs
- DoseCalculations
- InsulinActivity

---

# Project Structure

```text
glucobuddy/
│
├── glucobuddy-frontend/
│   ├── src/
│   ├── public/
│   └── vite.config.js
│
├── glucobuddy-backend/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   └── server.js
│
└── scripts/
```

---

# Setup Instructions

## 1. Clone the Repository

```bash
git clone <repository-url>
cd glucobuddy
```

---

## 2. Backend Setup

```bash
cd glucobuddy-backend
npm install
npm run dev
```

Create a `.env` file inside the backend directory:

```env
DB_USER=your_user
DB_PASSWORD=your_password
DB_SERVER=localhost
DB_DATABASE=GlucoBuddyData
DB_PORT=1433

JWT_SECRET=your_secret
JWT_EXPIRES_IN=1d
```

---

## 3. Frontend Setup

```bash
cd glucobuddy-frontend
npm install
npm run dev
```

---

## 4. Run SQL Server

The project uses Microsoft SQL Server running locally or via Docker.

Example Docker container:

```bash
docker run -e "ACCEPT_EULA=Y" ^
-e "SA_PASSWORD=YourStrongPassword123!" ^
-p 1433:1433 ^
--name sqlserver-dev ^
-d mcr.microsoft.com/mssql/server:2022-latest
```

---

## 5. Access the Application

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

---

# Development Workflow

## Frontend Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```

---

# PWA Support

The frontend includes Progressive Web App functionality with:

- Installable mobile experience
- Service worker caching
- Offline-ready architecture foundations
- Web manifest configuration

---

# Current Features Implemented

- User registration & login
- JWT authentication
- User diabetes settings
- Glucose logging
- Insulin logging
- Insulin dose calculation
- Glucose trend charts
- Insulin-on-board modelling
- Dark mode
- Mobile responsive layout
- Clinical report generation

---

# Planned Future Improvements

- Continuous Glucose Monitor (CGM) integration
- Push notifications and alerts
- Apple Health / Google Fit integration
- Advanced prediction modelling
- AI-assisted glucose trend analysis
- Multi-user clinician dashboard
- Cloud deployment infrastructure

---

# Screenshots

Suggested screenshots to include:

- Login screen
- Dashboard overview
- Glucose logging page
- Analytics graphs
- Mobile navigation
- Dark mode interface

---

# Security Considerations

- Passwords are hashed using bcrypt
- JWT authentication is required for protected endpoints
- Sensitive data is stored server-side
- Input validation is implemented across API routes
- User data isolation is enforced per authenticated account

---

# Author

Liam Jones  
BSc Computer Science Student  
University of Plymouth

---

# License

This project was developed for educational purposes as part of a university dissertation/project submission.
