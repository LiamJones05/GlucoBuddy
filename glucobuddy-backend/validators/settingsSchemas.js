const { z } = require('zod');

const updateSettingsSchema = z
  .object({
    correction_ratio: z.coerce.number().positive(),

    target_min: z.coerce.number().positive(),

    target_max: z.coerce.number().positive(),

    carb_ratio_morning: z.coerce.number().positive(),

    carb_ratio_afternoon: z.coerce.number().positive(),

    carb_ratio_evening: z.coerce.number().positive(),
  })
  .refine(
    (data) => data.target_min < data.target_max,
    {
      message: 'target_min must be less than target_max',
      path: ['target_min'],
    }
  );

module.exports = {
  updateSettingsSchema,
};