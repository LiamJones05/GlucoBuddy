const { z } = require('zod');

const createInsulinSchema = z.object({
  units: z.coerce
    .number()
    .positive('units must be greater than 0')
    .max(50, 'units must not exceed 50'),

  insulin_type: z
  .string()
  .transform((value) => value?.toLowerCase().trim())
  .pipe(
    z.enum(['rapid', 'long']).catch('rapid')
  ),

  logged_at: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
      'logged_at must be in YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss format'
    )
    .optional(),

  glucose_level: z.union([
    z.coerce.number().min(1).max(30),
    z.null(),
  ]).optional(),
});

module.exports = {
  createInsulinSchema,
};