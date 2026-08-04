const { z } = require('zod');

// HTML number inputs are submitted as strings unless the client converts them.
const createMealSchema = z.object({
  carbs: z.coerce.number().min(0, 'carbs must be zero or greater').max(500),
  protein: z.coerce.number().min(0, 'protein must be zero or greater').max(300),
});

module.exports = {
  createMealSchema,
};
