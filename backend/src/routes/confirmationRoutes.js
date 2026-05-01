// ============================================================
// FILE: backend/src/routes/confirmationRoutes.js
// ============================================================

const express = require('express');
const router = express.Router();
const confirmationController = require('../controllers/confirmationController');

// GET /api/confirmation/:bookingId — Confirmation details fetch karo
router.get('/:bookingId', confirmationController.getConfirmation);

module.exports = router;