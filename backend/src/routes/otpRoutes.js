const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otpController');

router.post('/assign', otpController.assignVehicle);
router.post('/verify', otpController.verifyVehicle);
router.post('/airport-trip', otpController.startAirportTrip);
router.put('/driver-location', otpController.updateDriverLocation);
router.put('/reached/:bookingId', otpController.reachedAirport);
router.get('/status/:bookingId', otpController.getStatus);

module.exports = router;
