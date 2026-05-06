const express = require('express');
const router = express.Router();

const controller = require('../controllers/insulinController');

const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const {
  createInsulinSchema,
} = require('../validators/insulinSchemas');

router.post(
  '/',
  auth,
  validate({ body: createInsulinSchema }),
  controller.createInsulin
);

router.get(
  '/',
  auth,
  controller.getInsulin
);

module.exports = router;