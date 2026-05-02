const pool = require('../config/db');

const demoSlots = () => {
  const now = new Date();
  const mk = (hours, id, loc, addr) => ({
    id,
    slot_time: new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString(),
    location_name: loc,
    location_address: addr,
    total_capacity: 8,
    booked_count: 0,
    available_seats: 8,
    is_available: true,
  });

  return [
    mk(2, 90001, 'City Walk Pickup', 'City Walk Terminal, Dubai'),
    mk(4, 90002, 'Downtown Pickup', 'Burj Vista Parking, Downtown Dubai'),
    mk(6, 90003, 'Marina Pickup', 'Marina Mall Drop Zone, Dubai'),
  ];
};

const getDemoSlot = (slotId) => demoSlots().find((slot) => Number(slot.id) === Number(slotId)) || null;

const ensureSlotSupportTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_bookings (
      id SERIAL PRIMARY KEY,
      booking_id VARCHAR(20),
      slot_id INT,
      vehicle_number VARCHAR(20),
      qr_code TEXT,
      status VARCHAR(20) DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_tracking (
      id SERIAL PRIMARY KEY,
      booking_id VARCHAR(20),
      vehicle_number VARCHAR(20),
      driver_name VARCHAR(80),
      passenger_count INT DEFAULT 1,
      status VARCHAR(40) DEFAULT 'Assigned',
      current_location VARCHAR(255),
      map_x NUMERIC DEFAULT 0.48,
      map_y NUMERIC DEFAULT 0.58,
      wait_minutes INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS booking_id VARCHAR(20)`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(20)`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS driver_name VARCHAR(80)`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS passenger_count INT DEFAULT 1`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'Assigned'`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS current_location VARCHAR(255)`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS map_x NUMERIC DEFAULT 0.48`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS map_y NUMERIC DEFAULT 0.58`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS wait_minutes INT DEFAULT 0`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
};

const getAvailableSlots = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, slot_time, location_name, location_address,
              COALESCE(total_capacity, 0) AS total_capacity,
              COALESCE(booked_count, 0) AS booked_count,
              (COALESCE(total_capacity, 0) - COALESCE(booked_count, 0)) AS available_seats,
              COALESCE(is_available, true) AS is_available
       FROM slots
       WHERE slot_time > NOW() - interval '6 hours'
         AND COALESCE(total_capacity, 0) > COALESCE(booked_count, 0)
         AND COALESCE(is_available, true) = true
       ORDER BY slot_time ASC
       LIMIT 20`
    );

    return res.status(200).json({
      success: true,
      slots: result.rows.length > 0 ? result.rows : demoSlots(),
    });
  } catch (error) {
    console.error('Get slots error:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch slots' });
  }
};

const bookSlot = async (req, res) => {
  let client;

  try {
    const { bookingId, slotId } = req.body;

    if (!bookingId || !slotId) {
      return res.status(400).json({
        success: false,
        message: 'bookingId and slotId are required',
      });
    }

    await ensureSlotSupportTables();

    client = await pool.connect();
    await client.query('BEGIN');

    const existingBooking = await client.query(
      `SELECT sb.*, s.slot_time, s.location_name, s.location_address
       FROM slot_bookings sb
       LEFT JOIN slots s ON s.id = sb.slot_id
       WHERE UPPER(sb.booking_id) = UPPER($1)
       ORDER BY sb.created_at DESC
       LIMIT 1`,
      [bookingId]
    );

    if (existingBooking.rows.length > 0) {
      const existing = existingBooking.rows[0];
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: 'Slot already booked!',
        confirmation: {
          bookingId,
          vehicleNumber: existing.vehicle_number,
          slotTime: existing.slot_time,
          locationName: existing.location_name,
          locationAddress: existing.location_address,
          qrCode: existing.qr_code,
          status: existing.status,
        },
      });
    }

    const slotResult = await client.query(
      `UPDATE slots
       SET booked_count = COALESCE(booked_count, 0) + 1,
           is_available = CASE
             WHEN COALESCE(booked_count, 0) + 1 >= COALESCE(total_capacity, 0) THEN false
             ELSE true
           END
       WHERE id = $1
         AND COALESCE(booked_count, 0) < COALESCE(total_capacity, 0)
         AND COALESCE(is_available, true) = true
       RETURNING *`,
      [slotId]
    );

    let slot = slotResult.rows[0];
    if (!slot) {
      slot = getDemoSlot(slotId);
      if (!slot) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Slot is no longer available. Please refresh and choose another.',
        });
      }
    }

    const vehicleNumber = `CT-${Math.floor(Math.random() * 900) + 100}`;
    const qrData = JSON.stringify({
      bookingId,
      slotId,
      vehicle: vehicleNumber,
      time: slot.slot_time,
      location: slot.location_name,
      generatedAt: new Date().toISOString(),
    });

    await client.query(
      `INSERT INTO slot_bookings (booking_id, slot_id, vehicle_number, qr_code, status)
       VALUES ($1, $2, $3, $4, 'confirmed')`,
      [bookingId, slotId, vehicleNumber, qrData]
    );

    await client.query(
      `INSERT INTO vehicle_tracking (
         booking_id, vehicle_number, driver_name, passenger_count, status,
         current_location, map_x, map_y, wait_minutes, updated_at
       )
       VALUES ($1, $2, 'City Terminal Driver', 1, 'Assigned', $3, 0.48, 0.58, 0, NOW())`,
      [bookingId, vehicleNumber, `Assigned for pickup at ${slot.location_name}`]
    );

    try {
      await client.query(
        `UPDATE bookings
         SET status = 'slot_booked'
         WHERE UPPER(booking_id) = UPPER($1)`,
        [bookingId]
      );
    } catch (statusErr) {
      console.warn('Status update failed, continuing:', statusErr.message);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Slot booked successfully!',
      confirmation: {
        bookingId,
        vehicleNumber,
        slotTime: slot.slot_time,
        locationName: slot.location_name,
        locationAddress: slot.location_address,
        qrCode: qrData,
        status: 'confirmed',
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_rollbackErr) {}
    }
    console.error('Book slot error:', error);
    return res.status(500).json({
      success: false,
      message: 'Booking failed: ' + error.message,
    });
  } finally {
    if (client) client.release();
  }
};

const getSlotByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await pool.query(
      `SELECT sb.*, s.slot_time, s.location_name, s.location_address
       FROM slot_bookings sb
       LEFT JOIN slots s ON sb.slot_id = s.id
       WHERE UPPER(sb.booking_id) = UPPER($1)
       ORDER BY sb.created_at DESC LIMIT 1`,
      [bookingId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No booking found' });
    }
    return res.status(200).json({ success: true, slotBooking: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAvailableSlots, bookSlot, getSlotByBooking };
