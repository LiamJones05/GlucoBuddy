const express = require('express');
const router = express.Router();
const controller = require('../controllers/glucoseController');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, controller.createGlucose);
router.get('/averages', auth, controller.getGlucoseAverages);
router.get('/insights', auth, controller.getGlucoseInsights);
router.get('/', auth, controller.getGlucose);

module.exports = router;
