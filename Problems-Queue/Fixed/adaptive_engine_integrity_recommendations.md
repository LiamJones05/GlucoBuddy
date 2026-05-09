# Adaptive Engine Integrity Fixes & Commercial Architecture Recommendations

## Current Issue

The adaptive engine is currently learning from all `DoseCalculations` rows that:

- fall within the outcome window
- do not yet have an outcome glucose recorded

Current query:

```sql
SELECT TOP 1
  id,
  glucose_input,
  carbs_input,
  recommended_dose,
  created_at
FROM DoseCalculations
WHERE user_id = @user_id
  AND outcome_glucose IS NULL
  AND created_at >= @window_start
  AND created_at <= @window_end
ORDER BY created_at DESC
```

This assumes every calculated dose represents insulin that was actually administered.

That assumption is unsafe.

---

# Why This Is A Problem

Users frequently:

- calculate doses without injecting
- recalculate meals multiple times
- inject different amounts than recommended
- abandon calculations entirely
- change meal composition
- delay injections
- correct manually later

This means the adaptive engine can currently learn from:

- phantom doses
- incorrect doses
- abandoned calculations
- contaminated glucose outcomes

Over time this can poison the adaptive model and gradually distort:

- carb ratios
- correction factors
- sensitivity estimates

This is especially dangerous because the EMA system adapts conservatively, making contamination subtle and difficult to detect.

---

# Current Flow (Unsafe)

```text
User opens calculator
    ↓
DoseCalculation created
    ↓
No confirmation required
    ↓
Outcome prompt appears 2h later
    ↓
Adaptive engine learns from potentially fake dose
```

---

# Recommended Immediate Fix

## Add Confirmation State

Add a field to `DoseCalculations`:

```sql
ALTER TABLE DoseCalculations
ADD confirmed_administered BIT NOT NULL DEFAULT 0;
```

---

## Update Injection Logging Flow

When a calculation is created:

```text
confirmed_administered = 0
```

Only after the user confirms insulin was actually administered:

```text
confirmed_administered = 1
```

This confirmation should happen when:

- insulin is logged
- user taps "Injected"
- dose is confirmed
- connected pump reports delivery

---

# Required Query Change

Update `findPendingOutcomeDose()` in `outcomeTracker.js`.

Current condition:

```sql
AND outcome_glucose IS NULL
```

Updated condition:

```sql
AND outcome_glucose IS NULL
AND confirmed_administered = 1
```

---

# Recommended Architecture (Commercial Grade)

## Current Architecture

```text
DoseCalculation
    ↓
Outcome Prompt
    ↓
Adaptive Learning
```

This is unsafe because calculations are recommendations, not confirmed interventions.

---

# Recommended Architecture

```text
DoseCalculation
    ↓ optional reference
InsulinLog
    ↓
Outcome Tracking
    ↓
Adaptive Learning
```

The adaptive engine should learn only from:

- confirmed insulin delivery events
- logged injections
- verified pump delivery

NOT from recommendations.

---

# Recommended Additional Learning Filters

Commercial adaptive systems heavily filter outcomes before learning from them.

The following situations should ideally be excluded from adaptation:

- significant exercise events
- alcohol-heavy events
- stacked corrections
- hypo recovery periods
- manual dose overrides
- unusually high-fat meals

---

# Recommended Future Improvements

## Confidence Scoring

Assign confidence scores to outcomes based on contamination risk.

Example:

```text
Clean meal:
Confidence = 0.95

Meal + exercise + alcohol:
Confidence = 0.25
```

Use confidence weighting in EMA updates.

---

# Multi-Window Outcome Tracking

Instead of a single 2-hour reading:

Track:
- 1h
- 2h
- 4h

This improves:
- spike detection
- delayed absorption modelling
- fat/protein analysis

---

# Summary

## Immediate Priority

Implement:

```sql
confirmed_administered BIT DEFAULT 0
```

and require confirmation before adaptive learning.

This is the single most important integrity fix.

---

# Long-Term Goal

Adaptive learning should ultimately operate from:

```text
Confirmed insulin delivery
+ validated glucose outcomes
+ contamination filtering
```

rather than raw calculator usage.

This creates a substantially safer and more commercially viable adaptive dosing system.
