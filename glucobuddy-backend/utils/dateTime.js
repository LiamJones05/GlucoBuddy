const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

function normaliseDateTime(dateTimeText) {
  return dateTimeText.length === 16 ? `${dateTimeText}:00` : dateTimeText;
}

function normaliseTime(timeText) {
  if (timeText.length === 5) {
    return `${timeText}:00`;
  }

  if (timeText.length === 8) {
    return timeText;
  }

  throw new Error('Invalid time format');
}

function formatLocalDateTime(date = new Date()) {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join('T');
}

function parseLocalDateTime(dateTimeText) {
  const [datePart, timePart] = normaliseDateTime(dateTimeText).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

function splitLoggedAt(dateTimeText) {
  const loggedAtText = normaliseDateTime(dateTimeText);
  const [loggedDate, rawLoggedTime] = loggedAtText.split('T');

  return {
    loggedAtText,
    loggedDate,
    loggedTime: normaliseTime(rawLoggedTime),
  };
}

function buildSqlTimeValue(timeText) {
  const [hours, minutes, seconds] = normaliseTime(timeText).split(':').map(Number);

  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds, 0));
}

module.exports = {
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  buildSqlTimeValue,
  formatLocalDateTime,
  normaliseDateTime,
  normaliseTime,
  parseLocalDateTime,
  splitLoggedAt,
};
