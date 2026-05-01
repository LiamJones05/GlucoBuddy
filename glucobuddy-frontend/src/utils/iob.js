export const INSULIN_ACTION_HOURS = 4.5;
const PEAK_ACTIVITY_HOURS = 1.25;
const IOB_INTERVAL_MINUTES = 15;
const DAY_END_MINUTES = 1439;

function insulinRemainingFraction(elapsedHours, duration = INSULIN_ACTION_HOURS) {
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0 || elapsedHours >= duration) {
    return 0;
  }

  if (elapsedHours <= PEAK_ACTIVITY_HOURS) {
    return Math.max(0, 1 - (0.08 * (elapsedHours / PEAK_ACTIVITY_HOURS)));
  }

  const decayProgress = (elapsedHours - PEAK_ACTIVITY_HOURS) / (duration - PEAK_ACTIVITY_HOURS);
  const tail = 0.92 * Math.exp(-3.2 * decayProgress);
  const linearTaper = 1 - Math.pow(decayProgress, 1.7);

  return Math.max(0, Math.min(1, tail * Math.max(0, linearTaper)));
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

    const elapsedHours = (atTime.getTime() - loggedAt.getTime()) / 3600000;
    return total + (units * insulinRemainingFraction(elapsedHours));
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
        ((loggedAt.getTime() + (INSULIN_ACTION_HOURS * 3600000)) - dayStart.getTime()) / 60000
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
