const express = require('express');
const router = express.Router();
const controller = require('../controllers/mealController');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { createMealSchema } = require('../validators/mealSchemas');

router.post('/', auth, validate({ body: createMealSchema }), controller.createMeal);
router.get('/', auth, controller.getMeals);

module.exports = router;
