const pool = require('../config/db');

const DRIVERS = [
  { driver_id: 'DRV-101', name: 'Mohammed Al-Ali', phone: '+971501111101', vehicle_id: 'CT-101' },
  { driver_id: 'DRV-102', name: 'Ahmed Hassan',    phone: '+971501111102', vehicle_id: 'CT-102' },
  { driver_id: 'DRV-103', name: 'Sara Ibrahim',    phone: '+971501111103', vehicle_id: 'CT-103' },
  { driver_id: 'DRV-104', name: 'Khalid Omar',     phone: '+971501111104', vehicle_id: 'CT-104' },
];

const STATUS_LABELS = {
  dispatched:       'Dispatched',
  en_route:         'En Route',
  arrived_pickup:   'Arrived at Pickup',
  barcode_issued:   'Barcode Issued',
  en_route_airport: 'En Route to Airport',
  at_airport:       'Arrived',
};

// In-memory fallback for when DB is offline
const fallbackAssignments = new Map();

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const pick = (...values) =>
  values.find((v) => v != null && String(v).trim() !== '');

/** Normalize vehicle ID: upper-case, strip non-alphanumeric (CT-102 == CT102) */
const normalizeVehicleId = (id) =>
  String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------------------------------------------------------------------------
// fetchFlightBlock — joins bookings table, degrades gracefully if missing
// ---------------------------------------------------------------------------
const fetchFlightBlock = async (bookingId) => {
  if (!bookingId) return null;
  try {
    const res = await pool.query(
      `SELECT
         COALESCE(passenger_name, full_name, name)        AS passenger_name,
         COALESCE(passenger_phone, phone, mobile)         AS passenger_phone,
         COALESCE(flight_number, flight_no, flight)       AS flight_number,
         COALESCE(departure_time, flight_time, dep_time)  AS departure_time,
         COALESCE(destination, destination_airport, dest) AS destination,
         COALESCE(airline, airline_code, carrier)         AS airline,
         COALESCE(terminal, destination_terminal)         AS terminal
       FROM bookings
       WHERE UPPER(TRIM(booking_id)) = UPPER(TRIM($1))
       LIMIT 1`,
      [bookingId]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      passengerName:  pick(r.passenger_name)  || null,
      passengerPhone: pick(r.passenger_phone) || null,
      flightNumber:   pick(r.flight_number)   || null,
      departureTime:  r.departure_time        || null,
      destination:    pick(r.destination)     || null,
      airline:        pick(r.airline)         || null,
      terminal:       pick(r.terminal)        || null,
    };
  } catch (_err) {
    return null; // table may not exist in all environments
  }
};

// ---------------------------------------------------------------------------
// DB bootstrapping
// ---------------------------------------------------------------------------
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
       SET name = EXCLUDED.name, phone = EXCLUDED.phone, vehicle_id = EXCLUDED.vehicle_id`,
      [driver.driver_id, driver.name, driver.phone, driver.vehicle_id]
    );
  }
};

const ensureVehicleTrackingColumns = async () => {
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
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS driver_lat DECIMAL(10,8)`);
  await pool.query(`ALTER TABLE vehicle_tracking ADD COLUMN IF NOT EXISTS driver_lng DECIMAL(11,8)`);
};

// ---------------------------------------------------------------------------
// Map / socket helpers
// ---------------------------------------------------------------------------
const coordsToMapXY = (lat, lng) => {
  if (lat == null || lng == null) return { x: 0.48, y: 0.58 };
  const minLat = 24.95, maxLat = 25.42, minLng = 54.89, maxLng = 55.61;
  const x = Math.max(0, Math.min(1, (Number(lng) - minLng) / (maxLng - minLng)));
  const y = Math.max(0, Math.min(1, 1 - (Number(lat) - minLat) / (maxLat - minLat)));
  return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
};

const upsertVehicleTracking = async ({ bookingId, vehicleId, driverName, status, currentLocation, lat, lng }) => {
  await ensureVehicleTrackingColumns();
  const { x, y } = coordsToMapXY(lat, lng);
  const upd = await pool.query(
    `UPDATE vehicle_tracking
     SET vehicle_number=$2, driver_name=$3, status=$4, current_location=$5,
         map_x=$6, map_y=$7,
         driver_lat=COALESCE($8, driver_lat),
         driver_lng=COALESCE($9, driver_lng),
         updated_at=NOW()
     WHERE UPPER(booking_id)=UPPER($1) RETURNING id`,
    [bookingId, vehicleId, driverName, status, currentLocation, x, y, lat ?? null, lng ?? null]
  );
  if (upd.rowCount > 0) return;
  await pool.query(
    `INSERT INTO vehicle_tracking
       (booking_id,vehicle_number,driver_name,passenger_count,status,current_location,map_x,map_y,driver_lat,driver_lng,wait_minutes,updated_at)
     VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,0,NOW())`,
    [bookingId, vehicleId, driverName, status, currentLocation, x, y, lat ?? null, lng ?? null]
  );
};

const emitTripUpdate = (req, payload) => {
  const io = req.app?.get?.('io');
  if (!io) return;
  const bookingKey = payload.bookingId || payload.booking_id;
  if (bookingKey) io.to(`booking:${bookingKey}`).emit('status_update', payload);
  io.to('dispatch').emit('vehicle_update', payload);
};

// ---------------------------------------------------------------------------
// Core DB helpers
// ---------------------------------------------------------------------------
const getAssignmentByBookingId = async (bookingId) => {
  const result = await pool.query(
    `SELECT va.*,
            dr.current_lat AS driver_live_lat,
            dr.current_lng AS driver_live_lng
     FROM vehicle_assignments va
     LEFT JOIN drivers dr ON dr.vehicle_id = va.vehicle_id
     WHERE UPPER(va.booking_id) = UPPER($1)
     ORDER BY va.created_at DESC
     LIMIT 1`,
    [bookingId]
  );
  return result.rows[0] || null;
};

const buildBarcodePayload = (assignment, overrides = {}) =>
  JSON.stringify({
    bookingId:           assignment.booking_id,
    vehicleId:           assignment.vehicle_id,
    driverName:          assignment.driver_name,
    driverPhone:         assignment.driver_phone,
    pickupLocation:      assignment.pickup_location,
    destinationTerminal: assignment.destination_terminal,
    issuedAt:            new Date().toISOString(),
    ...overrides,
  });

const resolveEffectiveStatus = (row) => {
  if (!row) return 'dispatched';
  if (row.reached_airport || row.status === 'at_airport')    return 'at_airport';
  if (row.status === 'en_route_airport')                     return 'en_route_airport';
  if (row.status === 'barcode_issued')                       return 'barcode_issued';
  if (row.reached_pickup || row.status === 'arrived_pickup') return 'arrived_pickup';
  if (row.status === 'en_route')                             return 'en_route';
  return row.status || 'dispatched';
};

// ---------------------------------------------------------------------------
// ★★★ toClientStatus — THE CRITICAL FUNCTION ★★★
//
// Postgres pg driver returns BOOLEAN columns as JS booleans.
// But fallback objects store them as false (JS boolean) already.
// We coerce explicitly to guarantee vehicleVerified is ALWAYS a true JS bool.
// The passenger app gates barcode display on: vehicleVerified === true
// ---------------------------------------------------------------------------
const toClientStatus = (row, statusOverride, flight = null) => {
  const status = statusOverride || row.status || 'dispatched';

  // ★ Explicit coercion — never let this be null/undefined/string
  const vehicleVerified =
    row.vehicle_verified === true  ||
    row.vehicle_verified === 'true' ||
    row.vehicleVerified  === true;

  return {
    id:              row.id,
    bookingId:       row.booking_id,
    vehicleId:       row.vehicle_id,
    driverName:      row.driver_name,
    driverPhone:     row.driver_phone,
    // ★ barcodeData must be non-null when vehicleVerified=true
    barcodeData:     row.barcode_data || null,
    // ★ vehicleVerified as explicit JS boolean — passenger app reads this
    vehicleVerified,
    barcodeScanned:  row.barcode_scanned  === true,
    luggageTagged:   row.luggage_tagged   === true,
    status,
    statusLabel:     STATUS_LABELS[status] || status,
    currentLocation: row.current_location,
    pickupLocation:  row.pickup_location,
    destinationTerminal: row.destination_terminal,
    reachedPickup:   row.reached_pickup  === true,
    reachedAirport:  row.reached_airport === true,
    driverLat:       row.driver_live_lat != null ? Number(row.driver_live_lat) : null,
    driverLng:       row.driver_live_lng != null ? Number(row.driver_live_lng) : null,
    etaMinutes:
      ['at_airport', 'arrived_pickup', 'barcode_issued'].includes(status) ? 0
      : status === 'en_route_airport' ? 10
      : status === 'en_route'         ? 12
      : 18,
    updatedAt: row.updated_at,
    // Flight/booking block — null when bookings table unavailable
    flight,
  };
};

const pickDriver = async () => {
  const result = await pool.query(
    `SELECT * FROM drivers WHERE COALESCE(is_available, true) = true ORDER BY RANDOM() LIMIT 1`
  );
  return result.rows[0] || DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
};

const isDriverBootstrapAssignment = (row) => {
  try { return JSON.parse(row.barcode_data || '{}').driverBootstrap === true; }
  catch (_e) { return false; }
};

const ensureAssignmentFromRegisteredVehicle = async (bookingId, vehicleId) => {
  let assignment = await getAssignmentByBookingId(bookingId);
  if (assignment) return assignment;
  if (!vehicleId || !String(vehicleId).trim()) return null;

  await ensureVehicleTables();
  const driverRes = await pool.query(
    `SELECT * FROM drivers
     WHERE UPPER(TRIM(COALESCE(vehicle_id::text,''))) = UPPER(TRIM($1::text))
     LIMIT 1`,
    [vehicleId]
  );
  const driver = driverRes.rows[0];
  if (!driver) return null;

  const vid = driver.vehicle_id || vehicleId;
  const barcodeData = JSON.stringify({
    bookingId, vehicleId: vid,
    driverName: driver.name, driverPhone: driver.phone,
    driverBootstrap: true, timestamp: new Date().toISOString(),
  });
  await pool.query(
    `INSERT INTO vehicle_assignments
       (booking_id,vehicle_id,driver_name,driver_phone,barcode_data,status,current_location,pickup_location,destination_terminal)
     VALUES ($1,$2,$3,$4,$5,'dispatched',$6,$7,$8)`,
    [bookingId, vid, driver.name, driver.phone, barcodeData,
     `Van ${vid} linked — awaiting passenger pickup sync`,
     'Pickup pending passenger app sync', 'Airport — confirm with passenger']
  );
  try { await pool.query(`UPDATE drivers SET is_available=false WHERE vehicle_id=$1`, [vid]); } catch (_e) {}
  return getAssignmentByBookingId(bookingId);
};

const makeFallbackAssignment = ({ bookingId, pickupLocation, destinationTerminal, pickupCoordinates }) => {
  const driver = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
  return {
    id: `fallback-${bookingId}`,
    booking_id: bookingId,
    vehicle_id: driver.vehicle_id,
    driver_name: driver.name,
    driver_phone: driver.phone,
    barcode_data: JSON.stringify({
      bookingId, vehicleId: driver.vehicle_id,
      pickupLocation, destinationTerminal,
      pickupCoordinates: pickupCoordinates || null,
      timestamp: new Date().toISOString(),
    }),
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

// ===========================================================================
// CONTROLLERS
// ===========================================================================

// POST /api/otp/assign
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
      if (isDriverBootstrapAssignment(existing)) {
        const barcodePayload = JSON.stringify({
          bookingId, vehicleId: existing.vehicle_id,
          driverName: existing.driver_name, driverPhone: existing.driver_phone,
          pickupLocation, destinationTerminal,
          pickupCoordinates: pickupCoordinates || null,
          timestamp: new Date().toISOString(),
        });
        await pool.query(
          `UPDATE vehicle_assignments
           SET pickup_location=$1, destination_terminal=$2,
               barcode_data=$3, current_location=$4, updated_at=NOW()
           WHERE id=$5`,
          [pickupLocation, destinationTerminal, barcodePayload,
           `Driver dispatched to ${pickupLocation}`, existing.id]
        );
        const refreshed = await getAssignmentByBookingId(bookingId);
        const plat = pickupCoordinates?.lat ?? null;
        const plng = pickupCoordinates?.lng ?? null;
        try {
          await upsertVehicleTracking({
            bookingId, vehicleId: refreshed.vehicle_id, driverName: refreshed.driver_name,
            status: 'En route to pickup', currentLocation: refreshed.current_location,
            lat: plat, lng: plng,
          });
        } catch (_e) {}
        const map = coordsToMapXY(plat, plng);
        emitTripUpdate(req, {
          bookingId, booking_id: bookingId,
          vehicle_number: refreshed.vehicle_id, vehicleId: refreshed.vehicle_id,
          driver_name: refreshed.driver_name, driver: refreshed.driver_name,
          passengers: 1, status: 'En route to pickup',
          current_location: refreshed.current_location,
          map_x: map.x, map_y: map.y, updated_at: new Date().toISOString(),
        });
        const flight = await fetchFlightBlock(bookingId);
        return res.status(200).json({
          success: true, message: 'Pickup synced with driver van',
          assignment: toClientStatus(refreshed, resolveEffectiveStatus(refreshed), flight),
        });
      }
      const flight = await fetchFlightBlock(bookingId);
      return res.status(200).json({
        success: true, message: 'Vehicle already assigned',
        assignment: toClientStatus(existing, resolveEffectiveStatus(existing), flight),
      });
    }

    const driver = await pickDriver();
    const vehicleId = driver.vehicle_id || `CT-${Math.floor(Math.random() * 99) + 101}`;
    const barcodeData = JSON.stringify({
      bookingId, vehicleId, pickupLocation, destinationTerminal,
      pickupCoordinates: pickupCoordinates || null, timestamp: new Date().toISOString(),
    });
    const result = await pool.query(
      `INSERT INTO vehicle_assignments
         (booking_id,vehicle_id,driver_name,driver_phone,barcode_data,status,current_location,pickup_location,destination_terminal)
       VALUES ($1,$2,$3,$4,$5,'dispatched',$6,$7,$8) RETURNING *`,
      [bookingId, vehicleId, driver.name, driver.phone, barcodeData,
       `Driver dispatched to ${pickupLocation}`, pickupLocation, destinationTerminal]
    );
    await pool.query(`UPDATE drivers SET is_available=false WHERE vehicle_id=$1`, [vehicleId]);

    const inserted = result.rows[0];
    const plat = pickupCoordinates?.lat ?? null;
    const plng = pickupCoordinates?.lng ?? null;
    try {
      await upsertVehicleTracking({
        bookingId, vehicleId, driverName: driver.name,
        status: 'En route to pickup', currentLocation: inserted.current_location,
        lat: plat, lng: plng,
      });
    } catch (_e) {}
    const map = coordsToMapXY(plat, plng);
    emitTripUpdate(req, {
      bookingId, booking_id: bookingId,
      vehicle_number: vehicleId, vehicleId,
      driver_name: driver.name, driver: driver.name,
      passengers: 1, status: 'En route to pickup',
      current_location: inserted.current_location,
      map_x: map.x, map_y: map.y, updated_at: new Date().toISOString(),
    });
    const flight = await fetchFlightBlock(bookingId);
    return res.status(200).json({
      success: true, message: 'Vehicle assigned',
      assignment: toClientStatus(inserted, undefined, flight),
    });
  } catch (error) {
    console.error('assignVehicle error:', error);
    const fallback = makeFallbackAssignment(req.body || {});
    fallbackAssignments.set(String(fallback.booking_id).toUpperCase(), fallback);
    const plat = req.body?.pickupCoordinates?.lat ?? null;
    const plng = req.body?.pickupCoordinates?.lng ?? null;
    const map = coordsToMapXY(plat, plng);
    emitTripUpdate(req, {
      bookingId: fallback.booking_id, booking_id: fallback.booking_id,
      vehicle_number: fallback.vehicle_id, vehicleId: fallback.vehicle_id,
      driver_name: fallback.driver_name, driver: fallback.driver_name,
      passengers: 1, status: 'En route to pickup',
      current_location: fallback.current_location,
      map_x: map.x, map_y: map.y, updated_at: new Date().toISOString(),
    });
    return res.status(200).json({
      success: true, demoMode: true, message: 'Vehicle assigned in demo mode',
      assignment: toClientStatus(fallback),
    });
  }
};

// ---------------------------------------------------------------------------
// ★ GET /api/otp/status/:bookingId
//
// Passenger app polls this every 10 seconds.
// Returns vehicleVerified=true + barcodeData after driver presses OTP button.
// ---------------------------------------------------------------------------
const getOTPStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId required' });
    }
    await ensureVehicleTables();

    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
    }

    const effective  = resolveEffectiveStatus(assignment);
    const flight     = await fetchFlightBlock(bookingId);
    const statusObj  = toClientStatus(assignment, effective, flight);

    // Server-side debug log — check this when passenger barcode won't show
    console.log(
      `[getOTPStatus] bookingId=${bookingId}` +
      ` status=${effective}` +
      ` vehicle_verified=${assignment.vehicle_verified}` +
      ` vehicleVerified=${statusObj.vehicleVerified}` +
      ` hasBarcodeData=${!!statusObj.barcodeData}`
    );

    return res.status(200).json({
      success: true,
      status: statusObj,   // ★ passenger app reads result.status.*
      flight,              // ★ convenience top-level key
    });
  } catch (error) {
    console.error('getOTPStatus error:', error);
    const fallback = fallbackAssignments.get(String(req.params?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    const effective = resolveEffectiveStatus(fallback);
    return res.status(200).json({
      success: true, demoMode: true,
      status: toClientStatus(fallback, effective),
      flight: null,
    });
  }
};

// ---------------------------------------------------------------------------
// ★ POST /api/otp/verify-vehicle  (also at /api/otp/verify)
//
// Driver app calls this after passenger reads Vehicle ID aloud.
// Sets vehicle_verified=true + status=barcode_issued in DB.
// Emits socket event with vehicleVerified=true so passenger sees it instantly
// (instead of waiting up to 10s for next poll).
// ---------------------------------------------------------------------------
const verifyVehicle = async (req, res) => {
  try {
    const { bookingId, vehicleId } = req.body;
    if (!bookingId || !vehicleId) {
      return res.status(400).json({ success: false, message: 'bookingId and vehicleId are required' });
    }

    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);

    // ── Fallback path (DB offline) ──────────────────────────────────────────
    if (!assignment) {
      const fallback = fallbackAssignments.get(String(bookingId).toUpperCase());
      if (!fallback) {
        return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
      }
      if (normalizeVehicleId(fallback.vehicle_id) !== normalizeVehicleId(vehicleId)) {
        return res.status(401).json({
          success: false,
          message: `Vehicle ID does not match. Expected ${fallback.vehicle_id}`,
        });
      }
      fallback.vehicle_verified = true;
      fallback.barcode_scanned  = false;
      fallback.luggage_tagged   = false;
      fallback.status           = 'barcode_issued';
      fallback.barcode_data     = buildBarcodePayload(fallback);
      fallback.current_location = 'Boarding barcode issued — luggage tag synced with dashboard';
      fallback.updated_at       = new Date();

      const fallbackStatusObj = toClientStatus(fallback, 'barcode_issued');
      emitTripUpdate(req, {
        bookingId, booking_id: bookingId,
        vehicle_number: fallback.vehicle_id, vehicleId: fallback.vehicle_id,
        driver_name: fallback.driver_name, driver_phone: fallback.driver_phone,
        vehicleVerified: true,
        status: 'barcode_issued',
        statusLabel: 'Barcode Issued',
        barcodeData: fallback.barcode_data,
        barcode_data: fallback.barcode_data,
        current_location: 'Boarding barcode issued',
        updated_at: new Date().toISOString(),
        flight: null,
      });
      return res.status(200).json({
        success: true, demoMode: true,
        message: 'Vehicle verified (demo mode) — passenger barcode unlocked',
        status: fallbackStatusObj,
        vehicleVerified: true,
        barcodeData: fallback.barcode_data,
        flight: null,
      });
    }

    // ── Normal DB path ──────────────────────────────────────────────────────

    // ★ Vehicle ID match — normalized (strips dashes, spaces, case)
    if (normalizeVehicleId(assignment.vehicle_id) !== normalizeVehicleId(vehicleId)) {
      console.warn(
        `[verifyVehicle] ID mismatch: DB="${assignment.vehicle_id}" got="${vehicleId}"`
      );
      return res.status(401).json({
        success: false,
        message: `Vehicle ID does not match. Your vehicle is ${assignment.vehicle_id}`,
      });
    }

    // reached_pickup gate is intentionally removed — driver step 2 is often
    // skipped on mobile. If you want strict enforcement uncomment this block:
    //
    // if (!assignment.reached_pickup && assignment.status !== 'arrived_pickup') {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Driver must press "Arrived at pickup" before verifying passenger.',
    //   });
    // }

    // ★ Build barcode + UPDATE in one atomic query
    const barcodePayload = buildBarcodePayload(assignment);

    const updateResult = await pool.query(
      `UPDATE vehicle_assignments
       SET vehicle_verified = true,
           barcode_scanned  = false,
           luggage_tagged   = false,
           barcode_data     = $2,
           status           = 'barcode_issued',
           current_location = 'Boarding barcode issued — luggage tag synced with dashboard',
           updated_at       = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignment.id, barcodePayload]
    );

    if (updateResult.rowCount === 0) {
      return res.status(500).json({ success: false, message: 'DB update failed — no rows affected' });
    }

    // ★ Re-fetch so we read vehicle_verified=true back from Postgres
    const rowAfter  = await getAssignmentByBookingId(bookingId);
    const flight    = await fetchFlightBlock(bookingId);
    const statusObj = toClientStatus(rowAfter || updateResult.rows[0], 'barcode_issued', flight);

    console.log(
      `[verifyVehicle] SUCCESS bookingId=${bookingId}` +
      ` vehicleVerified=${statusObj.vehicleVerified}` +
      ` hasBarcodeData=${!!statusObj.barcodeData}`
    );

    // ★ Socket emit — passenger app listens on 'status_update' event.
    // This fires IMMEDIATELY so passenger doesn't wait up to 10s for next poll.
    emitTripUpdate(req, {
      bookingId,
      booking_id:      bookingId,
      vehicle_number:  assignment.vehicle_id,
      vehicleId:       assignment.vehicle_id,
      driver_name:     assignment.driver_name,
      driver_phone:    assignment.driver_phone,
      driver:          assignment.driver_name,
      // ★ These two fields are what the passenger app reads from the socket event
      vehicleVerified: true,
      status:          'barcode_issued',
      statusLabel:     'Barcode Issued',
      barcodeData:     barcodePayload,
      barcode_data:    barcodePayload,   // snake_case alias
      current_location: 'Boarding barcode issued',
      updated_at:      new Date().toISOString(),
      flight,
    });

    return res.status(200).json({
      success: true,
      message: 'Vehicle verified — passenger barcode is now unlocked',
      // ★ Full status object — mirrors what getOTPStatus returns
      status:          statusObj,
      // ★ Convenience top-level keys so any consumer can read without drilling
      vehicleVerified: true,
      barcodeData:     barcodePayload,
      flight,
    });
  } catch (error) {
    console.error('verifyVehicle error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// POST /api/otp/airport-trip
// ---------------------------------------------------------------------------
const startAirportTrip = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId is required' });

    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });
    if (!assignment.vehicle_verified) {
      return res.status(400).json({
        success: false,
        message: 'Complete OTP verification (step 3) before starting airport trip',
      });
    }

    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET status='en_route_airport', luggage_tagged=true, barcode_scanned=true,
           current_location=$2, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [assignment.id, `Heading to ${assignment.destination_terminal}`]
    );
    const rowAfter = await getAssignmentByBookingId(bookingId);
    const loc = rowAfter || result.rows[0];

    try {
      await upsertVehicleTracking({
        bookingId, vehicleId: loc.vehicle_id, driverName: loc.driver_name,
        status: 'En route to Airport', currentLocation: loc.current_location,
        lat: null, lng: null,
      });
    } catch (_e) {}

    emitTripUpdate(req, {
      bookingId, booking_id: bookingId,
      vehicle_number: loc.vehicle_id, vehicleId: loc.vehicle_id,
      driver_name: loc.driver_name, driver: loc.driver_name,
      passengers: 1, status: 'En route to Airport',
      current_location: loc.current_location, updated_at: new Date().toISOString(),
    });

    const flight = await fetchFlightBlock(bookingId);
    return res.status(200).json({
      success: true, message: 'Airport trip started',
      status: toClientStatus(loc, 'en_route_airport', flight), flight,
    });
  } catch (error) {
    console.error('startAirportTrip error:', error);
    const fallback = fallbackAssignments.get(String(req.body?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    fallback.status = 'en_route_airport';
    fallback.luggage_tagged = true;
    fallback.barcode_scanned = true;
    fallback.current_location = `Heading to ${fallback.destination_terminal}`;
    fallback.updated_at = new Date();
    return res.status(200).json({
      success: true, demoMode: true,
      status: toClientStatus(fallback, 'en_route_airport'), flight: null,
    });
  }
};

// ---------------------------------------------------------------------------
// PUT /api/otp/driver-location
// ---------------------------------------------------------------------------
const updateDriverLocation = async (req, res) => {
  try {
    const { bookingId, vehicleId, lat, lng } = req.body || {};
    if (!vehicleId || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'vehicleId, lat, lng required' });
    }
    await ensureVehicleTables();
    await pool.query(
      `UPDATE drivers SET current_lat=$1, current_lng=$2
       WHERE UPPER(vehicle_id::text)=UPPER($3::text)`,
      [lat, lng, vehicleId]
    );
    if (bookingId) {
      const assignment = await getAssignmentByBookingId(bookingId);
      if (assignment && normalizeVehicleId(assignment.vehicle_id) === normalizeVehicleId(vehicleId)) {
        await upsertVehicleTracking({
          bookingId, vehicleId,
          driverName: assignment.driver_name,
          status: assignment.status === 'en_route_airport' ? 'En route to Airport' : 'En route to pickup',
          currentLocation: assignment.status === 'en_route_airport'
            ? assignment.current_location || `Heading to ${assignment.destination_terminal}`
            : assignment.pickup_location  || assignment.current_location || 'Driving',
          lat, lng,
        });
      }
    }
    const map = coordsToMapXY(Number(lat), Number(lng));
    emitTripUpdate(req, {
      bookingId, booking_id: bookingId, vehicleId, vehicle_number: vehicleId,
      lat, lng, map_x: map.x, map_y: map.y,
      current_location: 'Live GPS',
      status: bookingId ? 'Live' : 'Dispatch',
      updated_at: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, message: 'Location updated' });
  } catch (error) {
    console.error('updateDriverLocation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// PUT /api/otp/reached/:bookingId
// ---------------------------------------------------------------------------
const reachedAirport = async (req, res) => {
  try {
    const { bookingId } = req.params;
    await ensureVehicleTables();
    const assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Vehicle assignment not found' });

    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET reached_airport=true, status='at_airport',
           current_location=destination_terminal, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [assignment.id]
    );
    await pool.query(`UPDATE drivers SET is_available=true WHERE vehicle_id=$1`, [assignment.vehicle_id]);

    try {
      await upsertVehicleTracking({
        bookingId: assignment.booking_id, vehicleId: assignment.vehicle_id,
        driverName: assignment.driver_name, status: 'At terminal',
        currentLocation: assignment.destination_terminal, lat: null, lng: null,
      });
    } catch (_e) {}

    emitTripUpdate(req, {
      bookingId: assignment.booking_id, booking_id: assignment.booking_id,
      vehicle_number: assignment.vehicle_id, vehicleId: assignment.vehicle_id,
      driver_name: assignment.driver_name, driver: assignment.driver_name,
      status: 'Arrived — At Airport',
      current_location: assignment.destination_terminal,
      updated_at: new Date().toISOString(),
    });

    const flight = await fetchFlightBlock(assignment.booking_id);
    return res.status(200).json({
      success: true, message: 'Driver reached airport',
      status: toClientStatus(result.rows[0], 'at_airport', flight), flight,
    });
  } catch (error) {
    console.error('reachedAirport error:', error);
    const fallback = fallbackAssignments.get(String(req.params?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    fallback.reached_airport = true;
    fallback.status = 'at_airport';
    fallback.current_location = fallback.destination_terminal;
    fallback.updated_at = new Date();
    return res.status(200).json({
      success: true, demoMode: true,
      status: toClientStatus(fallback, 'at_airport'), flight: null,
    });
  }
};

// ---------------------------------------------------------------------------
// POST /api/otp/mark-en-route
// ---------------------------------------------------------------------------
const markEnRoutePickup = async (req, res) => {
  try {
    const { bookingId, vehicleId } = req.body || {};
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId required' });
    if (!vehicleId || !String(vehicleId).trim()) {
      return res.status(400).json({ success: false, message: 'vehicleId required (e.g. CT-102)' });
    }
    await ensureVehicleTables();
    let assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) assignment = await ensureAssignmentFromRegisteredVehicle(bookingId, vehicleId.trim());
    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'Unknown booking or vehicle. Use the passenger Booking ID and a Vehicle ID in drivers table.',
      });
    }
    if (normalizeVehicleId(assignment.vehicle_id) !== normalizeVehicleId(vehicleId)) {
      return res.status(401).json({ success: false, message: 'Vehicle ID mismatch' });
    }
    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET status='en_route', current_location=$2, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [assignment.id, `Driving to passenger pickup — ${assignment.pickup_location || 'pickup'}`]
    );
    const row = await getAssignmentByBookingId(bookingId);
    emitTripUpdate(req, {
      bookingId, booking_id: bookingId,
      vehicle_number: assignment.vehicle_id, vehicleId: assignment.vehicle_id,
      status: 'En route to pickup',
      current_location: result.rows[0]?.current_location,
      updated_at: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, status: toClientStatus(row || result.rows[0], 'en_route') });
  } catch (error) {
    console.error('markEnRoutePickup error:', error);
    const fallback = fallbackAssignments.get(String(req.body?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    fallback.status = 'en_route';
    fallback.current_location = `Driving to passenger pickup — ${fallback.pickup_location || ''}`;
    fallback.updated_at = new Date();
    return res.status(200).json({ success: true, demoMode: true, status: toClientStatus(fallback, 'en_route') });
  }
};

// ---------------------------------------------------------------------------
// POST /api/otp/mark-at-pickup
// ---------------------------------------------------------------------------
const markAtPickup = async (req, res) => {
  try {
    const { bookingId, vehicleId } = req.body || {};
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId required' });
    if (!vehicleId || !String(vehicleId).trim()) {
      return res.status(400).json({ success: false, message: 'vehicleId required (e.g. CT-102)' });
    }
    await ensureVehicleTables();
    let assignment = await getAssignmentByBookingId(bookingId);
    if (!assignment) assignment = await ensureAssignmentFromRegisteredVehicle(bookingId, vehicleId.trim());
    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'Unknown booking or vehicle. Use the passenger Booking ID and a Vehicle ID in drivers table.',
      });
    }
    if (normalizeVehicleId(assignment.vehicle_id) !== normalizeVehicleId(vehicleId)) {
      return res.status(401).json({ success: false, message: 'Vehicle ID mismatch' });
    }
    const result = await pool.query(
      `UPDATE vehicle_assignments
       SET status='arrived_pickup', reached_pickup=true,
           current_location='Arrived at pickup — ask passenger for Vehicle ID',
           updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [assignment.id]
    );
    const row = await getAssignmentByBookingId(bookingId);
    emitTripUpdate(req, {
      bookingId, booking_id: bookingId,
      vehicle_number: assignment.vehicle_id, vehicleId: assignment.vehicle_id,
      status: 'Arrived at Pickup',
      current_location: result.rows[0]?.current_location,
      updated_at: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, status: toClientStatus(row || result.rows[0], 'arrived_pickup') });
  } catch (error) {
    console.error('markAtPickup error:', error);
    const fallback = fallbackAssignments.get(String(req.body?.bookingId || '').toUpperCase());
    if (!fallback) return res.status(500).json({ success: false, message: error.message });
    fallback.status = 'arrived_pickup';
    fallback.reached_pickup = true;
    fallback.current_location = 'Arrived at pickup — ask passenger for Vehicle ID';
    fallback.updated_at = new Date();
    return res.status(200).json({ success: true, demoMode: true, status: toClientStatus(fallback, 'arrived_pickup') });
  }
};

// Backward-compat alias
const getStatus = getOTPStatus;

module.exports = {
  assignVehicle,
  verifyVehicle,
  startAirportTrip,
  updateDriverLocation,
  markEnRoutePickup,
  markAtPickup,
  reachedAirport,
  getOTPStatus,
  getStatus,
};