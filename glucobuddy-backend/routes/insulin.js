const express = require('express');
const router = express.Router();
const controller = require('../controllers/insulinController');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, controller.createInsulin);
router.get('/', auth, controller.getInsulin);

module.exports = router;