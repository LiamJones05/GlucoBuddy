const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { updateSettingsSchema, } = require('../validators/settingsSchemas');

// Protected routes
router.get('/', auth, settingsController.getSettings);
router.put(
  '/',
  auth,
  validate({ body: updateSettingsSchema }),
  settingsController.updateSettings
);

module.exports = router; 