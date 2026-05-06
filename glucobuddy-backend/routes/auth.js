const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const {
  registerSchema,
  loginSchema,
  deleteAccountSchema,
} = require('../validators/authSchemas');

router.post(
  '/register',
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
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