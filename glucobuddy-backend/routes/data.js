const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const dataController = require('../controllers/dataController');

router.get('/export', auth, dataController.exportUserData);
router.post('/import', auth, dataController.importUserData);
router.post('/preview', auth, dataController.previewImport);

module.exports = router;