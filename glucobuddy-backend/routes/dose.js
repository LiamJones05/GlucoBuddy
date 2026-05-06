const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const controller = require('../controllers/doseController');

const {
  calculateDoseSchema,
} = require('../validators/doseSchemas');

router.post(
  '/calculate',
  auth,
  validate({ body: calculateDoseSchema }),
  controller.calculateDose
);

module.exports = router;