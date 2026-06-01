// ============================================================
// FILE: backend/server.js — UPDATED
// ============================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*',
     methods: ['GET', 'POST'] },
});

app.set('io', io);

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// ── ROUTES ─────────────────────────────────────────────────
const bookingRoutes = require('./src/routes/bookingRoutes');
app.use('/api/bookings', bookingRoutes);

const passportRoutes = require('./src/routes/passportRoutes');
app.use('/api/passport', passportRoutes);

const slotRoutes = require('./src/routes/slotRoutes');
app.use('/api/slots', slotRoutes);

const otpRoutes = require('./src/routes/otpRoutes');
app.use('/api/otp', otpRoutes);

const aiRoutes = require('./src/routes/aiRoutes');
app.use('/api/ai', aiRoutes);

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

io.on('connection', (socket) => {
  socket.on('join_booking', ({ bookingId } = {}) => {
    if (bookingId) socket.join(`booking:${bookingId}`);
  });

  socket.on('leave_booking', ({ bookingId } = {}) => {
    if (bookingId) socket.leave(`booking:${bookingId}`);
  });

  socket.on('join_dispatch', () => {
    socket.join('dispatch');
  });

  socket.on('leave_dispatch', () => {
    socket.leave('dispatch');
  });

  socket.on('location_update', (payload = {}) => {
    const bookingId = payload.bookingId || payload.booking_id;
    if (bookingId) io.to(`booking:${bookingId}`).emit('location_update', payload);
    io.to('dispatch').emit('location_update', payload);
  });

  socket.on('status_update', (payload = {}) => {
    const bookingId = payload.bookingId || payload.booking_id;
    if (bookingId) io.to(`booking:${bookingId}`).emit('status_update', payload);
    io.to('dispatch').emit('status_update', payload);
    io.to('dispatch').emit('vehicle_update', payload);
  });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

const db = require('./src/config/db');

const PORT = process.env.PORT || 5000;

(async () => {
  const ok = await db.testConnection();
  server.listen(PORT, () => {
    console.log(`✅ City Terminal Backend running on port ${PORT}`);
    if (ok) {
      console.log('✅ Database connected (Supabase/Postgres)');
    } else {
      const hint = db.getLastDbError()?.message || 'Not configured';
      console.warn('⚠️  Database offline —', hint);
      console.warn('   Admin login still works: admin@cityterminal.ae / admin123');
      console.warn('   Fix: backend/.env → DATABASE_URL from Supabase (see .env.example)');
    }
  });
})();
