const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const controller = require('../controllers/glucoseController');

const {
  createGlucoseSchema,
} = require('../validators/glucoseSchemas');

// CREATE glucose
router.post(
  '/',
  auth,
  validate({ body: createGlucoseSchema }),
  controller.createGlucose
);

// READ endpoints
router.get('/averages', auth, controller.getGlucoseAverages);
router.get('/insights', auth, controller.getGlucoseInsights);
router.get('/', auth, controller.getGlucose);

module.exports = router; 