const { z } = require('zod');

const createGlucoseSchema = z.object({
  glucose_level: z.coerce
    .number()
    .min(1, 'glucose_level must be at least 1')
    .max(30, 'glucose_level must not exceed 30'),

  logged_at: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
      'logged_at must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format'
    ),
});

module.exports = {
  createGlucoseSchema,
};