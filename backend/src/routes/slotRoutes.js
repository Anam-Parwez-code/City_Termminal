// ============================================================
// FILE: backend/src/routes/slotRoutes.js
// ============================================================
const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slotController');

// GET /api/slots/available — Screen 6 ke liye available slots
router.get('/available', slotController.getAvailableSlots);

// POST /api/slots/book — Slot book karo
router.post('/book', slotController.bookSlot);

// GET /api/slots/booking/:bookingId — Booking ka slot details
router.get('/booking/:bookingId', slotController.getSlotByBooking);

module.exports = router;