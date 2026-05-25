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

const parseFlightDate = (value) => {
  if (!value) return null;
  let parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) && typeof value === 'string') {
    const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (match) {
      const [, dd, mm, yy, hh = '0', min = '0', meridian] = match;
      const fullYear = yy.length === 2 ? `20${yy}` : yy;
      let hour = Number(hh);
      if (meridian?.toLowerCase() === 'pm' && hour < 12) hour += 12;
      if (meridian?.toLowerCase() === 'am' && hour === 12) hour = 0;
      parsed = new Date(Number(fullYear), Number(mm) - 1, Number(dd), hour, Number(min));
    }
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const limitSlotsBeforeFlight = (slots, flightTime) => {
  const departure = parseFlightDate(flightTime);
  if (!departure) return slots;
  return slots.filter((slot) => {
    const slotTime = parseFlightDate(slot.slot_time);
    return slotTime && slotTime <= departure;
  });
};

const getFlightDepartureTime = async (bookingId) => {
  if (!bookingId) return null;
  try {
    const result = await pool.query(
      `SELECT departure_time
       FROM bookings
       WHERE UPPER(booking_id) = UPPER($1)
       LIMIT 1`,
      [bookingId]
    );
    const parsed = parseFlightDate(result.rows[0]?.departure_time);
    return parsed ? parsed.toISOString() : null;
  } catch (_err) {
    return null;
  }
};

const ensureSlotSupportTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_bookings (
      id SERIAL PRIMARY KEY,
      booking_id VARCHAR(20),
      slot_id INT,
      vehicle_number VARCHAR(20),
      driver_name VARCHAR(80),
      pickup_otp VARCHAR(8),
      proof_qr_code TEXT,
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
  await pool.query(`ALTER TABLE slot_bookings ADD COLUMN IF NOT EXISTS driver_name VARCHAR(80)`);
  await pool.query(`ALTER TABLE slot_bookings ADD COLUMN IF NOT EXISTS pickup_otp VARCHAR(8)`);
  await pool.query(`ALTER TABLE slot_bookings ADD COLUMN IF NOT EXISTS proof_qr_code TEXT`);
};

const makePickupOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const getAvailableSlots = async (req, res) => {
  try {
    const flightTime = await getFlightDepartureTime(req.query?.bookingId);
    const result = await pool.query(
      `SELECT id, slot_time, location_name, location_address,
              COALESCE(total_capacity, 0) AS total_capacity,
              COALESCE(booked_count, 0) AS booked_count,
              (COALESCE(total_capacity, 0) - COALESCE(booked_count, 0)) AS available_seats,
              COALESCE(is_available, true) AS is_available
       FROM slots
       WHERE slot_time > NOW() - interval '6 hours'
         AND ($1::timestamp IS NULL OR slot_time <= $1::timestamp)
         AND COALESCE(total_capacity, 0) > COALESCE(booked_count, 0)
         AND COALESCE(is_available, true) = true
       ORDER BY slot_time ASC
       LIMIT 20`,
      [flightTime]
    );

    const slots = result.rows.length > 0
      ? result.rows
      : limitSlotsBeforeFlight(demoSlots(), flightTime);

    return res.status(200).json({
      success: true,
      slots,
    });
  } catch (error) {
    console.error('Get slots error:', error);
    const flightTime = await getFlightDepartureTime(req.query?.bookingId);
    return res.status(200).json({
      success: true,
      demoMode: true,
      slots: limitSlotsBeforeFlight(demoSlots(), flightTime),
    });
  }
};

const bookSlot = async (req, res) => {
  let client;
  let bookingId;
  let slotId;

  try {
    ({ bookingId, slotId } = req.body);

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
          driverName: existing.driver_name || 'City Terminal Driver',
          pickupOtp: existing.pickup_otp,
          proofQrCode: existing.proof_qr_code,
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
    const driverName = 'City Terminal Driver';
    const pickupOtp = makePickupOtp();
    const qrData = JSON.stringify({
      bookingId,
      slotId,
      vehicle: vehicleNumber,
      driver: driverName,
      pickupOtp,
      time: slot.slot_time,
      location: slot.location_name,
      generatedAt: new Date().toISOString(),
    });

    await client.query(
      `INSERT INTO slot_bookings (booking_id, slot_id, vehicle_number, driver_name, pickup_otp, qr_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmed')`,
      [bookingId, slotId, vehicleNumber, driverName, pickupOtp, qrData]
    );

    await client.query(
      `INSERT INTO vehicle_tracking (
         booking_id, vehicle_number, driver_name, passenger_count, status,
         current_location, map_x, map_y, wait_minutes, updated_at
       )
       VALUES ($1, $2, $3, 1, 'Assigned', $4, 0.48, 0.58, 0, NOW())`,
      [bookingId, vehicleNumber, driverName, `Assigned for pickup at ${slot.location_name}`]
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
        driverName,
        pickupOtp,
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
    const demoSlot = getDemoSlot(slotId) || demoSlots()[0];
    if (bookingId && demoSlot) {
      const vehicleNumber = `CT-${Math.floor(Math.random() * 99) + 101}`;
      const driverName = 'City Terminal Driver';
      const pickupOtp = makePickupOtp();
      const qrData = JSON.stringify({
        bookingId,
        slotId: demoSlot.id,
        vehicle: vehicleNumber,
        driver: driverName,
        pickupOtp,
        time: demoSlot.slot_time,
        location: demoSlot.location_name,
        generatedAt: new Date().toISOString(),
        demoMode: true,
      });

      return res.status(200).json({
        success: true,
        demoMode: true,
        message: 'Slot booked in demo mode.',
        confirmation: {
          bookingId,
          vehicleNumber,
          driverName,
          pickupOtp,
          slotTime: demoSlot.slot_time,
          locationName: demoSlot.location_name,
          locationAddress: demoSlot.location_address,
          qrCode: qrData,
          status: 'confirmed',
        },
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Booking failed: ' + error.message,
    });
  } finally {
    if (client) client.release();
  }
};

const confirmPickupOtp = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;

    if (!bookingId || !otp) {
      return res.status(400).json({ success: false, message: 'bookingId and otp are required' });
    }

    await ensureSlotSupportTables();

    const existing = await pool.query(
      `SELECT sb.*, s.slot_time, s.location_name
       FROM slot_bookings sb
       LEFT JOIN slots s ON s.id = sb.slot_id
       WHERE UPPER(sb.booking_id) = UPPER($1)
       ORDER BY sb.created_at DESC
       LIMIT 1`,
      [bookingId]
    );

    if (existing.rows.length === 0 || String(existing.rows[0].pickup_otp) !== String(otp).trim()) {
      return res.status(401).json({ success: false, message: 'Invalid pickup OTP' });
    }

    const row = existing.rows[0];
    const proofQrCode = JSON.stringify({
      type: 'luggage_pickup_proof',
      bookingId: row.booking_id,
      vehicle: row.vehicle_number,
      driver: row.driver_name || 'City Terminal Driver',
      pickupOtp: row.pickup_otp,
      pickupLocation: row.location_name,
      verifiedAt: new Date().toISOString(),
    });

    await pool.query(
      `UPDATE slot_bookings
       SET proof_qr_code = $1, status = 'picked_up'
       WHERE id = $2`,
      [proofQrCode, row.id]
    );

    await pool.query(
      `UPDATE vehicle_tracking
       SET status = 'picked_up', current_location = 'Luggage picked up - heading to airport', updated_at = NOW()
       WHERE UPPER(booking_id) = UPPER($1)`,
      [bookingId]
    );

    return res.status(200).json({ success: true, proofQrCode, status: 'picked_up' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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

module.exports = { getAvailableSlots, bookSlot, getSlotByBooking, confirmPickupOtp };
