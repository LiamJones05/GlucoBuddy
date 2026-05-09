const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const {
  outcomeSchema,
  toggleSchema,
} = require('../validators/adaptiveSchemas');
const {
  getAdaptiveParams,
  getPendingOutcome,
  submitOutcome,
  toggleAdaptive,
  resetAdaptiveParams,
} = require('../controllers/adaptiveController');

router.use(auth);

router.get('/params', getAdaptiveParams);
router.get('/pending', getPendingOutcome);
router.post('/outcome', validate({ body: outcomeSchema }), submitOutcome);
router.post('/toggle', validate({ body: toggleSchema }), toggleAdaptive);
router.post('/reset', resetAdaptiveParams);

module.exports = router;