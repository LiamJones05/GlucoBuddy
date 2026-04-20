const express = require('express');
const router = express.Router();
const controller = require('../controllers/doseController');
const auth = require('../middleware/authMiddleware');

router.post('/calculate', auth, controller.calculateDose);

module.exports = router;