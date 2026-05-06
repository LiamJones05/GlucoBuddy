const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');

const dataController = require('../controllers/dataController');

const {
  importDataSchema,
} = require('../validators/dataSchemas');

router.get(
  '/export',
  auth,
  dataController.exportUserData
);

router.post(
  '/import',
  auth,
  validate({ body: importDataSchema }),
  dataController.importUserData
);

router.post(
  '/preview',
  auth,
  validate({ body: importDataSchema }),
  dataController.previewImport
);

module.exports = router;
