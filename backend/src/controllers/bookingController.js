const pool = require('../config/db');

const verifyBooking = async (req, res) => {
  try {
    const { bookingId, airlineCode } = req.body;

    if (!bookingId || !airlineCode) {
      return res.status(400).json({ success: false, message: 'Booking ID and airline required' });
    }

    const result = await pool.query(
      `SELECT * FROM bookings
       WHERE UPPER(booking_id) = UPPER($1)
       AND UPPER(airline_code) = UPPER($2)`,
      [bookingId, airlineCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, valid: false, message: 'Booking not found. Check your ID.' });
    }

    const booking = result.rows[0];

    return res.status(200).json({
      success: true,
      valid: true,
      bookingData: {
        bookingId: booking.booking_id,
        passengerName: booking.passenger_name,
        flightNumber: booking.flight_number,
        departureTime: booking.departure_time,
        destination: booking.destination,
        airlineCode: booking.airline_code,
        status: booking.status,
        passportNumber: booking.passport_number,
        dateOfBirth: booking.date_of_birth,
        nationality: booking.nationality,
      },
    });
  } catch (error) {
    console.error('Verify booking error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getBookingDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await pool.query(
      'SELECT * FROM bookings WHERE UPPER(booking_id) = UPPER($1)',
      [bookingId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    return res.status(200).json({ success: true, booking: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

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
