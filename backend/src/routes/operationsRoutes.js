const express = require('express');
const router = express.Router();
const {
  getStatsBar,
  getLiveVehicles,
  getPassengerList,
  getAnalytics,
} = require('../controllers/operationsController');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/stats', getStatsBar);
router.get('/vehicles', getLiveVehicles);
router.get('/passengers', getPassengerList);
router.get('/analytics', getAnalytics);

// Write-level example endpoint permission for future
router.post('/dispatch', authorizeRoles('Admin', 'Manager'), (_req, res) => {
  res.status(200).json({ success: true, message: 'Dispatch action accepted' });
});

module.exports = router;

