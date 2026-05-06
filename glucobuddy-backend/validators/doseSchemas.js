const { z } = require('zod');

// ISO datetime (supports HH:mm and HH:mm:ss)
const isoDateTimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
  'calculation_time must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format'
);

// Helper for optional numeric inputs from forms
const optionalNumber = (min, max) =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.number().min(min).max(max).optional().default(0)
  );

const calculateDoseSchema = z.object({
  glucose: z.coerce
    .number()
    .positive('glucose must be a positive number')
    .max(30, 'glucose must be 30 or less'),

  carbs: z.coerce
    .number()
    .min(0, 'carbs must be zero or greater')
    .max(500, 'carbs must be reasonable'),

  protein_grams: optionalNumber(0, 300),
  fat_grams: optionalNumber(0, 300),
  alcohol_units: optionalNumber(0, 20),
  recent_exercise_minutes: optionalNumber(0, 300),
  planned_exercise_minutes: optionalNumber(0, 300),

  calculation_time: isoDateTimeSchema.optional(),
});

module.exports = {
  calculateDoseSchema,
};