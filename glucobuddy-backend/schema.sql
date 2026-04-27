IF DB_ID(N'GlucoBuddyData') IS NULL
BEGIN
    CREATE DATABASE GlucoBuddyData;
END
GO

USE GlucoBuddyData;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        first_name NVARCHAR(100) NOT NULL,
        last_name NVARCHAR(100) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_Users_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Users_email UNIQUE (email)
    );
END
GO

IF OBJECT_ID(N'dbo.UserSettings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSettings (
        user_id INT NOT NULL PRIMARY KEY,
        correction_ratio DECIMAL(6,2) NOT NULL,
        target_min DECIMAL(5,2) NOT NULL,
        target_max DECIMAL(5,2) NOT NULL,
        carb_ratio_morning DECIMAL(6,2) NOT NULL,
        carb_ratio_afternoon DECIMAL(6,2) NOT NULL,
        carb_ratio_evening DECIMAL(6,2) NOT NULL,
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_UserSettings_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_UserSettings_Users
            FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID(N'dbo.GlucoseLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.GlucoseLogs (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        glucose_level DECIMAL(5,2) NOT NULL,
        logged_date DATE NOT NULL,
        logged_time TIME(0) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_GlucoseLogs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_GlucoseLogs_Users
            FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID(N'dbo.InsulinLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InsulinLogs (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        units DECIMAL(6,2) NOT NULL,
        insulin_type NVARCHAR(50) NOT NULL,
        logged_date DATE NOT NULL,
        logged_time TIME(0) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_InsulinLogs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_InsulinLogs_Users
            FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID(N'dbo.MealLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MealLogs (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        carbs DECIMAL(6,2) NOT NULL,
        protein DECIMAL(6,2) NOT NULL,
        logged_at DATETIME2(0) NOT NULL CONSTRAINT DF_MealLogs_logged_at DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_MealLogs_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_MealLogs_Users
            FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID(N'dbo.DoseCalculations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DoseCalculations (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        glucose_input DECIMAL(6,2) NOT NULL,
        carbs_input DECIMAL(6,2) NOT NULL,
        recommended_dose DECIMAL(6,2) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_DoseCalculations_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_DoseCalculations_Users
            FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE
    );
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_GlucoseLogs_User_Date_Time'
      AND object_id = OBJECT_ID(N'dbo.GlucoseLogs')
)
BEGIN
    CREATE INDEX IX_GlucoseLogs_User_Date_Time
        ON dbo.GlucoseLogs (user_id, logged_date, logged_time);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_InsulinLogs_User_Date_Time'
      AND object_id = OBJECT_ID(N'dbo.InsulinLogs')
)
BEGIN
    CREATE INDEX IX_InsulinLogs_User_Date_Time
        ON dbo.InsulinLogs (user_id, logged_date, logged_time);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_MealLogs_User_LoggedAt'
      AND object_id = OBJECT_ID(N'dbo.MealLogs')
)
BEGIN
    CREATE INDEX IX_MealLogs_User_LoggedAt
        ON dbo.MealLogs (user_id, logged_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_DoseCalculations_User_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.DoseCalculations')
)
BEGIN
    CREATE INDEX IX_DoseCalculations_User_CreatedAt
        ON dbo.DoseCalculations (user_id, created_at DESC);
END
GO


