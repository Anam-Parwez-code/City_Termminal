const pool = require('../config/db');

const DRIVERS = [
  { driver_id: 'DRV-101', name: 'Mohammed Al-Ali', phone: '+971501111101', vehicle_id: 'CT-101' },
  { driver_id: 'DRV-102', name: 'Ahmed Hassan', phone: '+971501111102', vehicle_id: 'CT-102' },
  { driver_id: 'DRV-103', name: 'Sara Ibrahim', phone: '+971501111103', vehicle_id: 'CT-103' },
  { driver_id: 'DRV-104', name: 'Khalid Omar', phone: '+971501111104', vehicle_id: 'CT-104' },
];

const STATUS_LABELS = {
  dispatched: 'Dispatched',
  en_route: 'En Route',
  arrived_pickup: 'Arrived at Pickup',
  en_route_airport: 'En Route to Airport',
  at_airport: 'At Airport',
};

const fallbackAssignments = new Map();

const makeFallbackAssignment = ({ bookingId, pickupLocation, destinationTerminal, pickupCoordinates }) => {
  const driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
  const barcodeData = JSON.stringify({
    bookingId,
    vehicleId: driver.vehicle_id,
    pickupLocation,
    destinationTerminal,
    pickupCoordinates: pickupCoordinates || null,
    timestamp: new Date().toISOString(),
  });

  return {
    id: `fallback-${bookingId}`,
    booking_id: bookingId,
    vehicle_id: driver.vehicle_id,
    driver_name: driver.name,
    driver_phone: driver.phone,
    barcode_data: barcodeData,
    vehicle_verified: false,
    barcode_scanned: false,
    luggage_tagged: false,
    status: 'dispatched',
    current_location: `Driver dispatched to ${pickupLocation}`,
    pickup_location: pickupLocation,
    destination_terminal: destinationTerminal,
    reached_pickup: false,
    reached_airport: false,
    created_at: new Date(),
    updated_at: new Date(),
  };
};

const ensureVehicleTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_assignments (
      id SERIAL PRIMARY KEY,
      booking_id VARCHAR(20) NOT NULL,
      vehicle_id VARCHAR(20) NOT NULL,
      driver_name VARCHAR(100),
      driver_phone VARCHAR(20),
      barcode_data TEXT,
      vehicle_verified BOOLEAN DEFAULT false,
      barcode_scanned BOOLEAN DEFAULT false,
      status VARCHAR(30) DEFAULT 'dispatched',
      current_location VARCHAR(100),
      pickup_location VARCHAR(100),
      destination_terminal VARCHAR(50),
      reached_pickup BOOLEAN DEFAULT false,
      reached_airport BOOLEAN DEFAULT false,
      luggage_tagged BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      driver_id VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      vehicle_id VARCHAR(20),
      is_available BOOLEAN DEFAULT true,
      current_lat DECIMAL(10,8),
      current_lng DECIMAL(11,8),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE vehicle_assignments ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(20)`);
  await pool.query(`ALTER TABLE vehicle_assignments ADD COLUMN IF NOT EXISTS barcode_scanned BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE vehicle_assignments ADD COLUMN IF NOT EXISTS luggage_tagged BOOLEAN DEFAULT false`);

  for (const driver of DRIVERS) {
    await pool.query(
      `INSERT INTO drivers (driver_id, name, phone, vehicle_id, is_available, current_lat, current_lng)
       VALUES ($1, $2, $3, $4, true, 25.2048, 55.2708)
       ON CONFLICT (driver_id) DO UPDATE
       SET name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           vehicle_id = EXCLUDED.vehicle_id`,
      [driver.driver_id, driver.name, driver.phone, driver.vehicle_id]
    );
  }
};

const toClientStatus = (row, statusOverride) => {
  const status = statusOverride || row.status || 'dispatched';
  return {
    id: row.id,
    bookingId: row.booking_id,
    vehicleId: row.vehicle_id,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    barcodeData: row.barcode_data,
    vehicleVerified: row.vehicle_verified,
    barcodeScanned: row.barcode_scanned,
    luggageTagged: row.luggage_tagged,
    status,
    statusLabel: STATUS_LABELS[status] || status,
    currentLocation: row.current_location,
    pickupLocation: row.pickup_location,
    destinationTerminal: row.destination_terminal,
    reachedPickup: row.reached_pickup,
    reachedAirport: row.reached_airport,
    etaMinutes: status === 'at_airport' || status === 'arrived_pickup' ? 0 : status === 'en_route_airport' ? 10 : status === 'en_route' ? 12 : 18,
    updatedAt: row.updated_at,
  };
};

const getSimulatedStatus = (row) => {
  if (row.reached_airport || row.status === 'at_airport') return 'at_airport';

  if (row.barcode_scanned || row.luggage_tagged || row.status === 'en_route_airport') {
    const updatedAt = new Date(row.updated_at || row.created_at).getTime();
    const airportAgeSeconds = Math.floor((Date.now() - updatedAt) / 1000);
    return airportAgeSeconds >= 20 ? 'at_airport' : 'en_route_airport';
  }

  if (row.reached_pickup || row.status === 'arrived_pickup') return 'arrived_pickup';

  const createdAt = new Date(row.created_at).getTime();
  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  if (ageSeconds >= 20) return 'arrived_pickup';
  if (ageSeconds >= 10) return 'en_route';
  return 'dispatched';
};

const pickDriver = async () => {
  const result = await pool.query(
    `SELECT * FROM drivers
     WHERE COALESCE(is_available, true) = true
     ORDER BY RANDOM()
     LIMIT 1`
  );
  if (result.rows[0]) return result.rows[0];
  return DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
};

const getAssignmentByBookingId = async (bookingId) => {
  const result = await pool.query(
    `SELECT *
     FROM vehicle_assignments
     WHERE UPPER(booking_id) = UPPER($1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [bookingId]
  );
  return result.rows[0] || null;
};

const assignVehicle = async (req, res) => {
  try {
    const { bookingId, pickupLocation, destinationTerminal, pickupCoordinates } = req.body;
    if (!bookingId || !pickupLocation || !destinationTerminal) {
      return res.status(400).json({
        success: false,
        message: 'bookingId, pickupLocation and destinationTerminal are required',
      });
    }

    await ensureVehicleTables();

    const existing = await getAssignmentByBookingId(bookingId);
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Vehicle already assigned',
        assignment: toClientStatus(existing, getSimulatedStatus(existing)),
      });
    }

    const driver = await pickDriver();
    const vehicleId = driver.vehicle_id || `CT-${Math.floor(Math.random() * 99) + 101}`;
    const barcodeData = JSON.stringify({
      bookingId,
      vehicleId,
      pickupLocation,
      destinationTerminal,
      pickupCoordinates: pickupCoordinates || null,
      timestamp: new Date().toISOString(),
    });

    const result = await pool.query(
      `INSERT INTO vehicle_assignments (
         booking_id, vehicle_id, driver_name, driver_phone, barcode_data,
         status, current_location, pickup_location, destination_terminal
       )
       VALUES ($1, $2, $3, $4, $5, 'dispatched', $6, $7, $8)
       RETURNING *`,
      [
        bookingId,
        vehicleId,
        driver.name,
        driver.phone,
        barcodeData,
        `Driver dispatched to ${pickupLocation}`,
        pickupLocation,
        destinationTerminal,
      ]
    );

    await pool.query(
      `UPDATE drivers SET is_available = false WHERE vehicle_id = $1`,
      [vehicleId]
    );

    return res.status(200).json({
      success: true,
      message: 'Vehicle assigned',
      assignment: toClientStatus(result.rows[0]),
    });
  } catch (error) {
    console.error('Assign vehicle error:', error);
    const fallback = makeFallbackAssignment(req.body || {});
    fallbackAssignments.set(String(fallback.booking_id).toUpperCase(), fallback);
    return res.status(200).json({
      success: true,
      demoMode: true,
      message: 'Vehicle assigned in demo mode',
      assignment: toClientStatus(fallback),
    });
  }
};

const verifyVehicle = async (req, res) => {
  try {
    const { bookingId, vehicleId } = req.body;
    if (!bookingId || !vehicleId) {
      return res.status(400).json({ success: false, message: 'bookingId and vehicleId are required' });
    }

    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
    }
    if (String(assignment.vehicle_id).toUpperCase() !== String(vehicleId).toUpperCase()) {
      return res.status(401).json({ success: false, message: 'Vehicle ID does not match this booking' });
    }

    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET vehicle_verified = true,
           barcode_scanned = true,
           luggage_tagged = true,
           status = 'en_route_airport',
           current_location = 'Luggage tagged - en route to airport',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignment.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Vehicle verified and luggage tagged',
      status: toClientStatus(result.rows[0]),
    });
  } catch (error) {
    const fallback = fallbackAssignments.get(String(req.body?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    if (String(fallback.vehicle_id).toUpperCase() !== String(req.body?.vehicleId || '').toUpperCase()) {
      return res.status(401).json({ success: false, message: 'Vehicle ID does not match this booking' });
    }
    fallback.vehicle_verified = true;
    fallback.barcode_scanned = true;
    fallback.luggage_tagged = true;
    fallback.status = 'en_route_airport';
    fallback.current_location = 'Luggage tagged - en route to airport';
    fallback.updated_at = new Date();
    return res.status(200).json({ success: true, demoMode: true, status: toClientStatus(fallback) });
  }
};

const reachedAirport = async (req, res) => {
  try {
    const { bookingId } = req.params;
    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
    }

    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET reached_airport = true,
           status = 'at_airport',
           current_location = destination_terminal,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignment.id]
    );

    await pool.query(`UPDATE drivers SET is_available = true WHERE vehicle_id = $1`, [assignment.vehicle_id]);

    return res.status(200).json({
      success: true,
      message: 'Driver reached airport',
      status: toClientStatus(result.rows[0], 'at_airport'),
    });
  } catch (error) {
    const fallback = fallbackAssignments.get(String(req.params?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    fallback.reached_airport = true;
    fallback.status = 'at_airport';
    fallback.current_location = fallback.destination_terminal;
    fallback.updated_at = new Date();
    return res.status(200).json({ success: true, demoMode: true, status: toClientStatus(fallback, 'at_airport') });
  }
};

const getStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
    }

    const simulatedStatus = getSimulatedStatus(assignment);
    let row = assignment;

    if (simulatedStatus !== assignment.status && !assignment.reached_airport) {
      const reachedPickup = simulatedStatus === 'arrived_pickup';
      const reachedAirport = simulatedStatus === 'at_airport';
      const result = await pool.query(
        `UPDATE vehicle_assignments
         SET status = $1,
             reached_pickup = CASE WHEN $2 THEN true ELSE reached_pickup END,
             reached_airport = CASE WHEN $3 THEN true ELSE reached_airport END,
             current_location = $4,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          simulatedStatus,
          reachedPickup,
          reachedAirport,
          simulatedStatus === 'at_airport'
            ? assignment.destination_terminal
            : simulatedStatus === 'arrived_pickup'
            ? `Arrived at ${assignment.pickup_location}`
            : simulatedStatus === 'en_route_airport'
            ? `En route to ${assignment.destination_terminal}`
            : `En route to ${assignment.pickup_location}`,
          assignment.id,
        ]
      );
      row = result.rows[0];
    }

    return res.status(200).json({
      success: true,
      status: toClientStatus(row, simulatedStatus),
    });
  } catch (error) {
    const fallback = fallbackAssignments.get(String(req.params?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    const simulatedStatus = getSimulatedStatus(fallback);
    fallback.status = simulatedStatus;
    if (simulatedStatus === 'arrived_pickup') fallback.reached_pickup = true;
    fallback.updated_at = new Date();
    return res.status(200).json({ success: true, demoMode: true, status: toClientStatus(fallback, simulatedStatus) });
  }
};

module.exports = {
  assignVehicle,
  verifyVehicle,
  reachedAirport,
  getStatus,
};
