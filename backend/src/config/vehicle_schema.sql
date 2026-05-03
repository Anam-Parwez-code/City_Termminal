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
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_booking_id
  ON vehicle_assignments (booking_id);

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
);

INSERT INTO drivers (driver_id, name, phone, vehicle_id, is_available, current_lat, current_lng)
VALUES
  ('DRV-101', 'Mohammed Al-Ali', '+971501111101', 'CT-101', true, 25.20480000, 55.27080000),
  ('DRV-102', 'Ahmed Hassan', '+971501111102', 'CT-102', true, 25.20480000, 55.27080000),
  ('DRV-103', 'Sara Ibrahim', '+971501111103', 'CT-103', true, 25.20480000, 55.27080000),
  ('DRV-104', 'Khalid Omar', '+971501111104', 'CT-104', true, 25.20480000, 55.27080000)
ON CONFLICT (driver_id) DO UPDATE
SET name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    vehicle_id = EXCLUDED.vehicle_id;
