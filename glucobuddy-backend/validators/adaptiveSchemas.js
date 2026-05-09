const { z } = require('zod');

const outcomeSchema = z.object({
  doseId: z.number().int().positive(),
  outcomeGlucose: z.number().min(1.0).max(30.0),
});

const toggleSchema = z.object({
  enabled: z.boolean(),
});

module.exports = { outcomeSchema, toggleSchema };