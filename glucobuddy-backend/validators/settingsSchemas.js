const { z } = require('zod');

const updateSettingsSchema = z
  .object({
    correction_ratio: z.number().positive(),

    target_min: z.number().positive(),

    target_max: z.number().positive(),

    carb_ratio_morning: z.number().positive(),

    carb_ratio_afternoon: z.number().positive(),

    carb_ratio_evening: z.number().positive(),
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