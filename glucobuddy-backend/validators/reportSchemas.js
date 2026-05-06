const { z } = require('zod');

// ---------------- BASE DATE ----------------
const dateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

// ---------------- MAIN QUERY SCHEMA ----------------
const getReportSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
})
.refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  }
)
.refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    const diffDays =
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

    return diffDays <= 90;
  },
  {
    message: 'Date range must be 90 days or fewer',
    path: ['endDate'],
  }
);

module.exports = {
  getReportSchema,
};