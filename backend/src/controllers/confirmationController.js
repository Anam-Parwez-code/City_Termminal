// ============================================================
// FILE: backend/src/controllers/confirmationController.js
// ============================================================

const pool = require('../config/db');

// GET /api/confirmation/:bookingId
// ConfirmationScreen — booking + slot details fetch karo
const getConfirmation = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Booking + slot booking join karo
    const result = await pool.query(
      `SELECT 
        b.booking_id, b.passenger_name, b.flight_number,
        b.departure_time, b.destination, b.airline_code,
        sb.vehicle_number, sb.qr_code, sb.status,
        s.slot_time, s.location_name, s.location_address
       FROM bookings b
       LEFT JOIN slot_bookings sb ON UPPER(sb.booking_id) = UPPER(b.booking_id)
       LEFT JOIN slots s ON sb.slot_id = s.id
       WHERE UPPER(b.booking_id) = UPPER($1)
       ORDER BY sb.created_at DESC
       LIMIT 1`,
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Confirmation not found' });
    }

    const row = result.rows[0];

    return res.status(200).json({
      success: true,
      confirmation: {
        bookingId: row.booking_id,
        passengerName: row.passenger_name,
        flightNumber: row.flight_number,
        departureTime: row.departure_time,
        destination: row.destination,
        vehicleNumber: row.vehicle_number,
        qrCode: row.qr_code,
        slotTime: row.slot_time,
        locationName: row.location_name,
        locationAddress: row.location_address,
        status: row.status,
      },
    });

  } catch (error) {
    console.error('Confirmation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getConfirmation };