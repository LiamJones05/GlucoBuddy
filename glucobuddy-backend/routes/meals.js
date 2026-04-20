const express = require('express');
const router = express.Router();
const controller = require('../controllers/mealController');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, controller.createMeal);
router.get('/', auth, controller.getMeals);

module.exports = router;