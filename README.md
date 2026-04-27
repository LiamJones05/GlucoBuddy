# GlucoBuddy

## Introduction
GlucoBuddy is a full-stack web application designed to assist individuals with diabetes in managing their blood glucose levels, insulin dosing, and dietary intake. The system provides users with tools to log glucose readings, track insulin usage, record meals, and calculate recommended insulin doses based on personalised settings.

The application consists of:
- A **React frontend** for user interaction
- A **Node.js/Express backend** for API logic
- A **SQL Server database** for persistent storage

---

## Aims and Objectives

### Aim
To design and develop a comprehensive diabetes management system that supports accurate insulin dose calculations and effective data tracking.

### Objectives
- Implement secure user authentication using JWT
- Store and manage user-specific medical settings
- Enable logging of:
  - Blood glucose levels
  - Insulin doses
  - Meals (carbohydrates and protein)
- Develop an insulin dose calculator based on:
  - Blood glucose levels
  - Carbohydrate intake
  - User-specific insulin-to-carb ratios
  - Correction factors
  - Insulin-on-board (IOB)
- Visualise health data for improved decision-making

---

## Key Features

- User authentication (register/login)
- Personalised diabetes settings
- Glucose tracking
- Insulin logging
- Meal tracking
- Intelligent insulin dose calculator
- Data visualisation (planned)

---

## Technology Stack

### Frontend
- React (Vite)
- React Router

### Backend
- Node.js
- Express.js
- JWT Authentication
- bcrypt (password hashing)

### Database
- Microsoft SQL Server

---

## System Architecture

```
Frontend (React)
      ↓
Backend API (Express)
      ↓
SQL Server Database
```

---

## Database Overview

Main tables:
- Users
- UserSettings
- GlucoseLogs
- InsulinLogs
- MealLogs
- DoseCalculations
- InsulinActivity

---

## Insulin Dose Calculation Logic

The system calculates insulin dosage using:

```
Total Dose = Carb Dose + Correction Dose - Insulin On Board (IOB)
```

### Components:
- **Carb Dose** = Carbohydrates / Insulin-to-carb ratio
- **Correction Dose** = (Current glucose - target max) / correction factor
- **IOB** = Remaining active insulin from previous doses

Safety constraints:
- No negative doses
- Optional rounding to nearest 0.5 units

---

## Setup Instructions

### 1. Clone the repository
```
git clone <your-repo-url>
```

---

### 2. Backend Setup
```
cd glucobuddy-backend
npm install
npm run dev
```

Create a `.env` file:
```
DB_USER=your_user
DB_PASSWORD=your_password
DB_SERVER=localhost
DB_DATABASE=GlucoBuddyData
DB_PORT=1433
JWT_SECRET=your_secret
```

---

### 3. Frontend Setup
```
cd glucobuddy-frontend
npm install
npm run dev
```

---

### 4. Access the App
```
Frontend: http://localhost:5173
Backend: http://localhost:3000
```

---

## Future Improvements

- Advanced insulin-on-board modelling
- Graph visualisation (glucose & insulin trends)
- Mobile responsiveness
- Notifications and alerts
- Integration with wearable devices

---

## Conclusion

GlucoBuddy provides a structured and extensible platform for diabetes management, combining data tracking with intelligent insulin calculation. The system demonstrates full-stack development principles and real-world application of database design, API development, and frontend engineering.

---

## Author
Liam Jones

3rd Year Computer Science Student
