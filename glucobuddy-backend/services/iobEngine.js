const INSULIN_ACTION_HOURS = 4.5;
const PEAK_ACTIVITY_HOURS = 1.25;

function parseLocalDateTime(dateTimeText) {
  if (dateTimeText instanceof Date) {
    return dateTimeText;
  }

  const normalised = String(dateTimeText || '').length === 16 ? `${dateTimeText}:00` : dateTimeText;
  const [datePart, timePart] = String(normalised || '').split('T');

  if (!datePart || !timePart) {
    return new Date(Number.NaN);
  }

  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

function getElapsedHours(atTime, loggedAt) {
  const atDate = parseLocalDateTime(atTime);
  const loggedDate = parseLocalDateTime(loggedAt);
  return (atDate.getTime() - loggedDate.getTime()) / 3600000;
}

function getRapidActingRemainingFraction(elapsedHours, actionHours = INSULIN_ACTION_HOURS) {
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0 || elapsedHours >= actionHours) {
    return 0;
  }

  if (elapsedHours <= PEAK_ACTIVITY_HOURS) {
    const earlyDrop = 0.08 * (elapsedHours / PEAK_ACTIVITY_HOURS);
    return Math.max(0, 1 - earlyDrop);
  }

  const decayProgress = (elapsedHours - PEAK_ACTIVITY_HOURS) / (actionHours - PEAK_ACTIVITY_HOURS);
  const tail = 0.92 * Math.exp(-3.2 * decayProgress);
  const linearTaper = 1 - Math.pow(decayProgress, 1.7);

  return Math.max(0, Math.min(1, tail * Math.max(0, linearTaper)));
}

function calculateInsulinOnBoard(insulinLogs, atTime, actionHours = INSULIN_ACTION_HOURS) {
  return insulinLogs.reduce((total, log) => {
    const units = Number(log.units);
    const loggedAt = log.logged_at || log.loggedAt;

    if (!Number.isFinite(units) || !loggedAt) {
      return total;
    }

    const elapsedHours = getElapsedHours(atTime, loggedAt);
    const remainingFraction = getRapidActingRemainingFraction(elapsedHours, actionHours);

    return total + (units * remainingFraction);
  }, 0);
}

function calculateInsulinActivity(insulinLogs, atTime, actionHours = INSULIN_ACTION_HOURS) {
  const sampleMinutes = 15;
  const nowIob = calculateInsulinOnBoard(insulinLogs, atTime, actionHours);
  const laterDate = new Date(parseLocalDateTime(atTime).getTime() + (sampleMinutes * 60000));
  const laterIob = calculateInsulinOnBoard(insulinLogs, laterDate, actionHours);

  return Math.max(0, (nowIob - laterIob) / (sampleMinutes / 60));
}

module.exports = {
  INSULIN_ACTION_HOURS,
  PEAK_ACTIVITY_HOURS,
  calculateInsulinActivity,
  calculateInsulinOnBoard,
  getRapidActingRemainingFraction,
};
