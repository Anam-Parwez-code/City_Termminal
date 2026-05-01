// ============================================================
// FILE: backend/server.js — UPDATED
// ============================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// ── ROUTES ─────────────────────────────────────────────────
const bookingRoutes = require('./src/routes/bookingRoutes');
app.use('/api/bookings', bookingRoutes);

const passportRoutes = require('./src/routes/passportRoutes');
app.use('/api/passport', passportRoutes);

const slotRoutes = require('./src/routes/slotRoutes');
app.use('/api/slots', slotRoutes);

// NEW: Confirmation route
const confirmationRoutes = require('./src/routes/confirmationRoutes');
app.use('/api/confirmation', confirmationRoutes);

const adminAuthRoutes = require('./src/routes/adminAuthRoutes');
app.use('/api/admin/auth', adminAuthRoutes);

const operationsRoutes = require('./src/routes/operationsRoutes');
app.use('/api/admin/operations', operationsRoutes);

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'City Terminal API running!' });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ City Terminal Backend running on port ${PORT}`);
});