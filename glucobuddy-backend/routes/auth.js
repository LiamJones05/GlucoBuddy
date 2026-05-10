const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const {
  registerSchema,
  loginSchema,
  deleteAccountSchema,
} = require('../validators/authSchemas');

// 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please try again in 15 minutes.',
  },
});

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.get('/me', auth, authController.me);

router.delete(
  '/account',
  auth,
  validate({ body: deleteAccountSchema }),
  authController.deleteAccount
);

module.exports = router;