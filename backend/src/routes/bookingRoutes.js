// ============================================================
// FILE: backend/src/routes/bookingRoutes.js
// BOOKING ROUTES — Kaunsi URL pe kya controller chalega
// ============================================================
// Route = URL + HTTP Method + Controller function
// Mobile app URL call karti hai → Route pakadta hai → Controller chalata hai
// ============================================================

const express = require('express');
const router = express.Router(); // Mini express app — sirf routes ke liye

// Controller import karo — actual kaam wahan hoga
const bookingController = require('../controllers/bookingController');

// ─── ROUTES ──────────────────────────────────────────────

// POST /api/bookings/verify
// Screen 3 (BookingEntry) yeh call karta hai
// Body mein: { bookingId, airlineCode }
router.post('/verify', bookingController.verifyBooking);

// GET /api/bookings/:bookingId
// Booking ki details fetch karo
router.get('/:bookingId', bookingController.getBookingDetails);

// PUT /api/bookings/:bookingId/passport
// Passport verified hone ke baad update karo
router.put('/:bookingId/passport', bookingController.updatePassportData);

module.exports = router;