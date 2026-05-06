const { z } = require('zod');

const isoDateTimeSchema = z.string().refine(
  (value) => !isNaN(Date.parse(value)),
  {
    message: 'Invalid ISO datetime',
  }
);

const glucoseLogSchema = z.object({
  glucose_level: z.coerce
    .number()
    .min(1)
    .max(30),

  logged_at: isoDateTimeSchema,
});

const insulinLogSchema = z.object({
  units: z.coerce
    .number()
    .positive()
    .max(50),

  insulin_type: z.enum(['rapid', 'long']),

  logged_at: isoDateTimeSchema,
});

const mealLogSchema = z.object({
  carbs: z.coerce.number().min(0).max(500),
  protein: z.coerce.number().min(0).max(300),
  logged_at: isoDateTimeSchema,
});

const doseCalculationSchema = z.object({
  glucose_input: z.coerce.number().min(1).max(30),

  carbs_input: z.coerce.number().min(0).max(500),

  recommended_dose: z.coerce.number().min(0).max(50),

  created_at: isoDateTimeSchema,
});

const settingsSchema = z.object({
  correction_ratio: z.coerce.number().positive(),
  target_min: z.coerce.number().positive(),
  target_max: z.coerce.number().positive(),

  carb_ratio_morning: z.coerce.number().positive(),
  carb_ratio_afternoon: z.coerce.number().positive(),
  carb_ratio_evening: z.coerce.number().positive(),
})
.passthrough()
.refine(
  (data) => data.target_min < data.target_max,
  {
    message: 'target_min must be less than target_max',
    path: ['target_min'],
  }
);


const importDataSchema = z.object({
  version: z.enum(['1.0', '1.1']),

  settings: settingsSchema.optional(),

  data: z.object({
    glucoseLogs: z.array(glucoseLogSchema).default([]),

    insulinLogs: z.array(insulinLogSchema).default([]),

    mealLogs: z.array(mealLogSchema).default([]),

    doseCalculations: z.array(doseCalculationSchema).default([]),
  }),
});


module.exports = {
  importDataSchema,
};
