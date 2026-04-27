const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportController');
const auth = require('../middleware/authMiddleware');

router.get('/summary', auth, controller.getReportSummary);

module.exports = router;
