const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

router.post('/recommend-pickup', aiController.recommendPickup);
router.post('/recommend-slot', aiController.recommendSlot);

module.exports = router;
