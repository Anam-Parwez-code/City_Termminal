const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');

router.post('/assign', otpController.assignVehicle);
router.post('/verify', otpController.verifyVehicle);
router.post('/verify-vehicle', otpController.verifyVehicle);
router.post('/airport-trip', otpController.startAirportTrip);
router.post('/mark-en-route', otpController.markEnRoutePickup);
router.post('/mark-at-pickup', otpController.markAtPickup);
router.post('/accept-booking', otpController.acceptBooking);
router.put('/driver-location', otpController.updateDriverLocation);
router.put('/reached/:bookingId', otpController.reachedAirport);
router.get('/status/:bookingId', otpController.getStatus);
router.get('/pending/:vehicleId', otpController.listPendingBookings);

module.exports = router;
