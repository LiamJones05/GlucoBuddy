const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const controller = require('../controllers/reportController');

const {
  getReportSchema,
} = require('../validators/reportSchemas');

router.get(
  '/summary',
  auth,
  validate({ query: getReportSchema }),
  controller.getReportSummary
);

module.exports = router;