const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function normaliseDateTime(dateTimeText) {
  return dateTimeText.length === 16 ? `${dateTimeText}:00` : dateTimeText;
}

function parseLocalDateTime(dateTimeText) {
  const [datePart, timePart] = normaliseDateTime(dateTimeText).split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

module.exports = {
  DATE_PATTERN,
  DATE_TIME_PATTERN,
  normaliseDateTime,
  parseLocalDateTime,
};
