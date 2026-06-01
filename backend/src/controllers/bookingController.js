const pool = require('../config/db');

const DEMO_BOOKINGS = {
  EK123456: {
    booking_id: 'EK123456',
    passenger_name: 'Aisha Khan',
    flight_number: 'EK202',
    departure_time: '2026-06-01T14:30:00',
    destination: 'London (LHR)',
    airline_code: 'EK',
    seat_number: '12A',
    terminal: 'Terminal 3',
    passport_number: null,
    date_of_birth: null,
    nationality: null,
    booking_status: 'confirmed',
    vehicle_id: null,
    driver_name: null,
    driver_phone: null,
    vehicle_status: 'scheduled',
    vehicle_verified: false,
    barcode_data: null,
  },
  QR789012: {
    booking_id: 'QR789012',
    passenger_name: 'Omar Hassan',
    flight_number: 'QR815',
    departure_time: '2026-06-01T18:00:00',
    destination: 'Doha (DOH)',
    airline_code: 'QR',
    seat_number: '8C',
    terminal: 'Terminal 1',
    booking_status: 'confirmed',
    vehicle_status: 'scheduled',
    vehicle_verified: false,
    barcode_data: null,
  },
};

const rowToBookingResponse = (row) => {
  const vehicleVerified =
    row.vehicle_verified === true ||
    ['at_airport', 'barcode_issued', 'en_route_airport'].includes(
      String(row.vehicle_status || '').toLowerCase()
    );

  return {
    success: true,
    valid: true,
    demoMode: Boolean(row.demoMode),
    bookingData: {
      booking_id: row.booking_id,
      passenger_name: row.passenger_name || 'Passenger',
      flight_number: row.flight_number || 'N/A',
      departure_time: row.departure_time || null,
      destination: row.destination || '-',
      airline_code: row.airline_code || '-',
      seat_number: row.seat_number || 'N/A',
      terminal: row.terminal || 'Terminal 3',
      passport_number: row.passport_number || null,
      date_of_birth: row.date_of_birth || null,
      nationality: row.nationality || null,
      vehicle_id: row.vehicle_id || null,
      driver_name: row.driver_name || null,
      driver_phone: row.driver_phone || null,
      status: row.vehicle_status || row.booking_status || 'Scheduled',
      vehicle_verified: vehicleVerified,
      barcode_data: vehicleVerified ? (row.barcode_data || row.booking_id) : null,
    },
  };
};

const verifyDemoBooking = (bookingId, airlineCode) => {
  const id = String(bookingId || '').trim().toUpperCase();
  const row = DEMO_BOOKINGS[id];
  if (!row) return null;
  if (
    airlineCode &&
    String(row.airline_code).toUpperCase() !== String(airlineCode).trim().toUpperCase()
  ) {
    return null;
  }
  return rowToBookingResponse({ ...row, demoMode: true });
};

// ── 1. VERIFY & FETCH BOOKING (Main API for Profile Sync) ───────────────────
const verifyBooking = async (req, res) => {
  try {
    const { bookingId, airlineCode } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    if (pool.isDbReachable && !pool.isDbReachable()) {
      const demo = verifyDemoBooking(bookingId, airlineCode);
      if (demo) return res.status(200).json(demo);
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Booking not found (demo: try EK123456 + Emirates).',
      });
    }

    // Dynamic Query: Airline code ho toh check kare, nahi toh sirf Booking ID se nikale
    let queryText = `
      SELECT 
        b.booking_id,
        b.passenger_name,
        b.flight_number,
        b.departure_time,
        b.destination,
        b.airline_code,
        b.seat_number,
        b.terminal,
        b.passport_number,
        b.date_of_birth,
        b.nationality,
        b.status AS booking_status,
        va.vehicle_id,
        va.driver_name,
        va.driver_phone,
        va.status AS vehicle_status,
        va.vehicle_verified,
        va.barcode_data
       FROM bookings b
       LEFT JOIN vehicle_assignments va ON UPPER(b.booking_id) = UPPER(va.booking_id)
       WHERE UPPER(b.booking_id) = UPPER($1)
    `;
    
    const queryParams = [bookingId];
    if (airlineCode) {
      queryText += ` AND UPPER(b.airline_code) = UPPER($2)`;
      queryParams.push(airlineCode);
    }

    const result = await pool.query(queryText, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, valid: false, message: 'Booking not found.' });
    }

    const row = result.rows[0];
    return res.status(200).json(rowToBookingResponse(row));
  } catch (error) {
    console.error('Verify booking error:', error.message);
    const demo = verifyDemoBooking(req.body?.bookingId, req.body?.airlineCode);
    if (demo) return res.status(200).json(demo);
    return res.status(500).json({
      success: false,
      message: error.code === 'DB_OFFLINE'
        ? 'Database offline — use demo booking EK123456'
        : 'Server error',
    });
  }
};

// ── 2. GET BOOKING DETAILS BY ID ───────────────────────────────────────────
// ── 2. GET BOOKING DETAILS BY ID (Updated Response Structure) ───────────────────
const getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await pool.query(
      `SELECT b.*, va.vehicle_id, va.driver_name, va.driver_phone, va.status as vehicle_status, va.vehicle_verified, va.barcode_data 
       FROM bookings b 
       LEFT JOIN vehicle_assignments va ON UPPER(b.booking_id) = UPPER(va.booking_id)
       WHERE UPPER(b.booking_id) = UPPER($1)`,
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const row = result.rows[0];

    // 🔥 FIX: Response me 'bookingData' banakar terminal directly pass kar rahe hain
    return res.status(200).json({ 
      success: true, 
      booking: row, 
      bookingData: { 
        booking_id: row.booking_id,
        passenger_name: row.passenger_name || 'Passenger',
        passenger_phone: row.passenger_phone || '-',
        flight_number: row.flight_number || 'N/A',
        departure_time: row.departure_time || null,
        destination: row.destination || '-',
        airline_code: row.airline_code || '-',
        terminal: row.terminal || 'Terminal 1', // 🎯 Agar DB me null bhi hua, toh Terminal 1 fallback dega
        passport_number: row.passport_number || null,
        date_of_birth: row.date_of_birth || null,
        nationality: row.nationality || null,
        vehicle_id: row.vehicle_id || null,
        driver_name: row.driver_name || null,
        driver_phone: row.driver_phone || null,
        status: row.vehicle_status || row.status || 'Scheduled',
        vehicle_verified: row.vehicle_verified === true || ['barcode_issued', 'en_route_airport', 'at_airport'].includes(String(row.vehicle_status || '').toLowerCase()),
        barcode_data: (row.vehicle_verified === true || ['barcode_issued', 'en_route_airport', 'at_airport'].includes(String(row.vehicle_status || '').toLowerCase()))
          ? (row.barcode_data || row.booking_id)
          : null
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── 3. UPDATE PASSPORT DATA ────────────────────────────────────────────────
const updatePassportData = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { passportNumber, verifiedName, dateOfBirth, nationality } = req.body;

    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passport_number VARCHAR(40)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(20)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS nationality VARCHAR(80)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'passport_verified'`);

    await pool.query(
      `UPDATE bookings
       SET passport_number = COALESCE($1, passport_number),
           passenger_name = COALESCE($2, passenger_name),
           date_of_birth = COALESCE($3, date_of_birth),
           nationality = COALESCE($4, nationality),
           status = 'passport_verified'
       WHERE UPPER(booking_id) = UPPER($5)`,
      [
        passportNumber || null,
        verifiedName || null,
        dateOfBirth || null,
        nationality || null,
        bookingId,
      ]
    );

    return res.status(200).json({ success: true, message: 'Passport details updated successfully' });
  } catch (error) {
    console.error('Update passport error:', error.message);
    return res.status(200).json({ success: true, message: 'Continuing without passport update' });
  }
};

module.exports = { verifyBooking, getBookingDetails, updatePassportData };
