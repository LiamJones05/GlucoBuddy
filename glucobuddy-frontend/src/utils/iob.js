export const INSULIN_ACTION_HOURS = 4;
const IOB_INTERVAL_MINUTES = 15;
const DAY_END_MINUTES = 1439;

function insulinRemainingFraction(t, duration) {
  if (t <= 0) return 1;
  if (t >= duration) return 0;

  const peak = duration * 0.25; // ~1 hour peak if duration = 4h

  if (t <= peak) {
    // slow initial drop
    return 1 - 0.05 * (t / peak);
  }

  // decay phase
  const x = (t - peak) / (duration - peak);

  // exponential tail
  return 0.95 * Math.exp(-2.5 * x);
}

function normaliseDateTime(dateTimeText) {
  return dateTimeText.length === 16 ? `${dateTimeText}:00` : dateTimeText;
}

function parseLocalDateTime(dateTimeText) {
  const [datePart, timePart] = normaliseDateTime(dateTimeText).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

function clampMinutes(minutes) {
  return Math.max(0, Math.min(DAY_END_MINUTES, minutes));
}

export function calculateInsulinOnBoard(insulinLogs, atTime) {
  return insulinLogs.reduce((total, log) => {
    const units = Number(log.units);
    const loggedAt = parseLocalDateTime(log.loggedAt || log.logged_at);

    if (!Number.isFinite(units) || Number.isNaN(loggedAt.getTime())) {
      return total;
    }

    const elapsedHours = (atTime.getTime() - loggedAt.getTime()) / (1000 * 60 * 60);

    if (elapsedHours < 0 || elapsedHours >= INSULIN_ACTION_HOURS) {
      return total;
    }

    const remainingFraction = insulinRemainingFraction(
  elapsedHours,
  INSULIN_ACTION_HOURS
);

return total + (units * remainingFraction);
  }, 0);
}

export function buildIobSeries(insulinLogs, selectedDate) {
  if (!selectedDate || insulinLogs.length === 0) {
    return [];
  }

  const dayStart = parseLocalDateTime(`${selectedDate}T00:00:00`);
  const minutePoints = new Set();

  insulinLogs.forEach((log) => {
    const loggedAt = parseLocalDateTime(log.loggedAt || log.logged_at);

    if (Number.isNaN(loggedAt.getTime())) {
      return;
    }

    const windowStartMinutes = clampMinutes(
      Math.floor((loggedAt.getTime() - dayStart.getTime()) / 60000)
    );
    const windowEndMinutes = clampMinutes(
      Math.ceil(
        ((loggedAt.getTime() + (INSULIN_ACTION_HOURS * 60 * 60 * 1000)) - dayStart.getTime()) / 60000
      )
    );
    const intervalStart = Math.max(
      0,
      Math.floor(windowStartMinutes / IOB_INTERVAL_MINUTES) * IOB_INTERVAL_MINUTES
    );

    minutePoints.add(windowStartMinutes);
    minutePoints.add(windowEndMinutes);

    for (let minute = intervalStart; minute <= windowEndMinutes; minute += IOB_INTERVAL_MINUTES) {
      minutePoints.add(minute);
    }
  });

  return Array.from(minutePoints)
    .sort((a, b) => a - b)
    .map((minutesSinceMidnight) => {
      const atTime = new Date(dayStart.getTime() + (minutesSinceMidnight * 60000));

      return {
        minutesSinceMidnight,
        iob: Number(calculateInsulinOnBoard(insulinLogs, atTime).toFixed(2)),
      };
    });
}

export function buildChartData(glucoseData, insulinLogs, selectedDate) {
  const chartPoints = new Map();

  glucoseData.forEach((entry) => {
    chartPoints.set(entry.minutesSinceMidnight, {
      ...chartPoints.get(entry.minutesSinceMidnight),
      minutesSinceMidnight: entry.minutesSinceMidnight,
      glucose: entry.glucose,
    });
  });

  buildIobSeries(insulinLogs, selectedDate).forEach((entry) => {
    chartPoints.set(entry.minutesSinceMidnight, {
      ...chartPoints.get(entry.minutesSinceMidnight),
      minutesSinceMidnight: entry.minutesSinceMidnight,
      iob: entry.iob,
    });
  });

  return Array.from(chartPoints.values()).sort(
    (a, b) => a.minutesSinceMidnight - b.minutesSinceMidnight
  );
}
