const pool = require('../config/db');

const safeQuery = async (sql, params = [], fallback = []) => {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (_err) {
    return fallback;
  }
};

const getStatsBar = async (_req, res) => {
  const totalPassengers = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM bookings WHERE DATE(created_at) = CURRENT_DATE`,
    [],
    [{ count: 0 }]
  );
  const activeVehicles = await safeQuery(
    `SELECT COUNT(DISTINCT vehicle_number)::int AS count FROM vehicle_tracking WHERE status IN ('En route','At terminal')`,
    [],
    [{ count: 0 }]
  );
  const availableSlots = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM slots WHERE booked_count < total_capacity AND slot_time > NOW()`,
    [],
    [{ count: 0 }]
  );
  const avgWait = await safeQuery(
    `SELECT COALESCE(AVG(wait_minutes),0)::int AS avg_wait FROM vehicle_tracking`,
    [],
    [{ avg_wait: 0 }]
  );

  return res.status(200).json({
    success: true,
    data: {
      totalPassengersToday: totalPassengers[0].count,
      activeVehicles: activeVehicles[0].count,
      availableSlots: availableSlots[0].count,
      avgWaitTimeMinutes: avgWait[0].avg_wait,
    },
  });
};

const getLiveVehicles = async (_req, res) => {
  const vehicles = await safeQuery(
    `SELECT
      vehicle_number AS id,
      booking_id,
      driver_name AS driver,
      passenger_count AS passengers,
      status,
      current_location,
      map_x,
      map_y,
      updated_at
    FROM vehicle_tracking
    ORDER BY updated_at DESC
    LIMIT 200`,
    [],
    []
  );

  return res.status(200).json({ success: true, data: vehicles });
};

const getPassengerList = async (req, res) => {
  const { q = '' } = req.query;

  await safeQuery(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'confirmed'`);
  await safeQuery(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS departure_time VARCHAR(80)`);
  await safeQuery(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination VARCHAR(120)`);

  let rows = await safeQuery(
    `SELECT
      b.passenger_name AS name,
      b.flight_number AS flight,
      b.booking_id AS booking_id,
      b.departure_time,
      b.destination,
      s.slot_time,
      COALESCE(sb.status, b.status) AS status,
      sb.vehicle_number,
      sb.pickup_otp,
      sb.proof_qr_code,
      sb.qr_code,
      vt.status AS vehicle_status,
      vt.current_location,
      b.status AS flight_status
    FROM bookings b
    LEFT JOIN slot_bookings sb ON UPPER(sb.booking_id) = UPPER(b.booking_id)
    LEFT JOIN slots s ON s.id = sb.slot_id
    LEFT JOIN vehicle_tracking vt ON UPPER(vt.booking_id) = UPPER(b.booking_id)
    WHERE b.passenger_name ILIKE $1 OR b.booking_id ILIKE $1 OR b.flight_number ILIKE $1
    ORDER BY b.created_at DESC
    LIMIT 500`,
    [`%${q}%`],
    []
  );

  if (rows.length === 0 && q) {
    rows = await safeQuery(
      `SELECT
        COALESCE(b.passenger_name, 'Passenger') AS name,
        b.flight_number AS flight,
        sb.booking_id AS booking_id,
        b.departure_time,
        b.destination,
        s.slot_time,
        COALESCE(sb.status, b.status, 'confirmed') AS status,
        sb.vehicle_number,
        sb.pickup_otp,
        sb.proof_qr_code,
        sb.qr_code,
        vt.status AS vehicle_status,
        vt.current_location,
        COALESCE(b.status, sb.status, 'confirmed') AS flight_status
      FROM slot_bookings sb
      LEFT JOIN bookings b ON UPPER(b.booking_id) = UPPER(sb.booking_id)
      LEFT JOIN slots s ON s.id = sb.slot_id
      LEFT JOIN vehicle_tracking vt ON UPPER(vt.booking_id) = UPPER(sb.booking_id)
      WHERE sb.booking_id ILIKE $1
      ORDER BY sb.created_at DESC
      LIMIT 50`,
      [`%${q}%`],
      []
    );
  }

  return res.status(200).json({ success: true, data: rows });
};

const getAnalytics = async (_req, res) => {
  const hourly = await safeQuery(
    `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS passengers
     FROM bookings
     WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY 1 ORDER BY 1`,
    [],
    []
  );

  const terminalDistribution = await safeQuery(
    `SELECT COALESCE(terminal, 'Unknown') AS terminal, COUNT(*)::int AS count
     FROM bookings
     GROUP BY terminal
     ORDER BY count DESC`,
    [],
    []
  );

  const peakHours = [...hourly].sort((a, b) => b.passengers - a.passengers).slice(0, 3);

  return res.status(200).json({
    success: true,
    data: {
      hourlyPassengers: hourly,
      peakHours,
      terminalDistribution,
    },
  });
};

module.exports = {
  getStatsBar,
  getLiveVehicles,
  getPassengerList,
  getAnalytics,
};

