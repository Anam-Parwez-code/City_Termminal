const express = require('express');
const router = express.Router();
const passportController = require('../controllers/passportController');
 
// POST /api/passport/scan
// Screen 4 (PassportScan) yeh call karta hai
router.post('/scan', passportController.scanPassport);
 
module.exports = router;
 