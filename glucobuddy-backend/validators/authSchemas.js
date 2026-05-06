const { z } = require('zod');

// ---------- REGISTER ----------
const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),

  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(100),

  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(100),
});

// ---------- LOGIN ----------
const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(1, 'Password is required'),
});

// ---------- DELETE ACCOUNT ----------
const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required'),
});

module.exports = {
  registerSchema,
  loginSchema,
  deleteAccountSchema,
};