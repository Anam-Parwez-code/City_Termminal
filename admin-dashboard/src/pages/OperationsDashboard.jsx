import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api';

const SOCKET_URL = 'http://localhost:5000';

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

const isArrived = (status) => {
  const value = normalizeStatus(status);
  return value === 'arrived' || value === 'at terminal' || value === 'airport terminal';
};

const playTerminalSound = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1174, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.36);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.38);
  } catch (_err) {
    // Browser autoplay policies can block audio until the operator interacts.
  }
};

const StatCard = ({ label, value }) => (
  <div className="stat-card">
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
  </div>
);

const VehicleMap = ({ vehicles }) => {
  const points = vehicles
    .filter((v) => typeof v.map_x === 'number' && typeof v.map_y === 'number')
    .slice(0, 50);

  return (
    <div className="panel">
      <div className="panel-title-row">
        <h3>Live Dispatch Map</h3>
        <span className="live-chip">Live</span>
      </div>
      <div className="map-box">
        {points.map((v) => (
          <div
            key={`${v.id}-${v.updated_at}`}
            className={`map-point ${isArrived(v.status) ? 'arrived' : ''}`}
            title={`${v.id} | ${v.status} | ${v.driver || 'N/A'}`}
            style={{ left: `${v.map_x * 100}%`, top: `${v.map_y * 100}%` }}
          />
        ))}
      </div>
      <small>OpenStreetMap-style dispatch view with live van positions.</small>
    </div>
  );
};

const OperationsDashboard = ({ auth, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [analytics, setAnalytics] = useState({ hourlyPassengers: [], peakHours: [], terminalDistribution: [] });
  const [q, setQ] = useState('');
  const [lastTerminalVehicle, setLastTerminalVehicle] = useState('');

  const canManage = auth?.user?.role === 'Admin' || auth?.user?.role === 'Manager';

  const loadData = async () => {
    const [s, v, p, a] = await Promise.all([
      api.get('/admin/operations/stats'),
      api.get('/admin/operations/vehicles'),
      api.get('/admin/operations/passengers', { params: { q } }),
      api.get('/admin/operations/analytics'),
    ]);
    setStats(s.data.data);
    setVehicles(v.data.data || []);
    setPassengers(p.data.data || []);
    setAnalytics(a.data.data || {});
  };

  useEffect(() => {
    loadData();
  }, [q]);

  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [q]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
    });

    const mergeVehicle = (payload) => {
      const incoming = {
        id: payload.vehicle_number || payload.vehicleId || payload.id,
        booking_id: payload.bookingId || payload.booking_id,
        driver: payload.driver || payload.driver_name,
        passengers: payload.passengers || payload.passenger_count,
        status: payload.status,
        current_location: payload.current_location || payload.location,
        map_x: payload.map_x,
        map_y: payload.map_y,
        updated_at: payload.updated_at || new Date().toISOString(),
      };

      if (!incoming.id && !incoming.booking_id) return;

      setVehicles((prev) => {
        const next = [...prev];
        const index = next.findIndex(
          (v) => v.id === incoming.id || (incoming.booking_id && v.booking_id === incoming.booking_id)
        );
        const existing = index >= 0 ? next[index] : {};
        const merged = { ...existing, ...incoming };

        if (isArrived(merged.status) && !isArrived(existing.status)) {
          setLastTerminalVehicle(merged.id || merged.booking_id);
          playTerminalSound();
        }

        if (index >= 0) next[index] = merged;
        else next.unshift(merged);
        return next.slice(0, 200);
      });
    };

    socket.emit('join_dispatch');
    socket.on('vehicle_update', mergeVehicle);
    socket.on('location_update', mergeVehicle);
    socket.on('status_update', mergeVehicle);

    return () => {
      socket.emit('leave_dispatch');
      socket.disconnect();
    };
  }, []);

  const peakSummary = useMemo(
    () => (analytics.peakHours || []).map((h) => `${h.hour}:00 (${h.passengers})`).join(', '),
    [analytics]
  );

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div>
          <h1>Operations Dashboard</h1>
          <small>{auth?.user?.name} ({auth?.user?.role})</small>
        </div>
        <div className="topbar-actions">
          <button onClick={loadData}>Refresh</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Total Passengers Today" value={stats?.totalPassengersToday ?? 0} />
        <StatCard label="Active Vehicles" value={stats?.activeVehicles ?? 0} />
        <StatCard label="Available Slots" value={stats?.availableSlots ?? 0} />
        <StatCard label="Avg Wait Time (min)" value={stats?.avgWaitTimeMinutes ?? 0} />
      </section>

      <section className="two-col">
        <VehicleMap vehicles={vehicles} />
        <div className="panel">
          <div className="panel-title-row">
            <h3>Luggage Van Fleet</h3>
            {lastTerminalVehicle && <span className="arrival-chip">{lastTerminalVehicle} arrived</span>}
          </div>
          <table>
            <thead>
              <tr>
                <th>Vehicle ID</th>
                <th>Driver</th>
                <th>Booking</th>
                <th>Passengers</th>
                <th>Status</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.slice(0, 50).map((v) => (
                <tr key={`${v.id}-${v.booking_id}-${v.updated_at}`} className={isArrived(v.status) ? 'row-arrived' : ''}>
                  <td>{v.id}</td>
                  <td>{v.driver || 'N/A'}</td>
                  <td>{v.booking_id || '--'}</td>
                  <td>{v.passengers ?? 0}</td>
                  <td><span className="status-pill">{v.status || 'Unknown'}</span></td>
                  <td>{v.current_location || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Passenger List</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name / booking / flight"
          />
        </div>
        <table>
          <thead>
              <tr>
                <th>Name</th>
                <th>Flight</th>
                <th>Booking ID</th>
                <th>Boarding QR</th>
                <th>Pickup OTP</th>
                <th>Proof QR</th>
                <th>Vehicle</th>
                <th>Vehicle Status</th>
                <th>Destination</th>
                <th>Departure</th>
                <th>Flight Status</th>
                <th>Slot Time</th>
                <th>Status</th>
              </tr>
          </thead>
          <tbody>
            {passengers.slice(0, 50).map((p) => (
              <tr key={`${p.booking_id}-${p.flight}`}>
                <td>{p.name}</td>
                <td>{p.flight}</td>
                <td>{p.booking_id}</td>
                <td className="qr-cell">{p.qr_code || p.booking_id}</td>
                <td className="otp-cell">{p.pickup_otp || '--'}</td>
                <td>{p.proof_qr_code ? <span className="arrival-chip">Generated</span> : '--'}</td>
                <td>{p.vehicle_number || '--'}</td>
                <td>{p.vehicle_status || p.current_location || '--'}</td>
                <td>{p.destination || '--'}</td>
                <td>{p.departure_time || '--'}</td>
                <td>{p.flight_status || '--'}</td>
                <td>{p.slot_time ? new Date(p.slot_time).toLocaleString() : '--'}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="two-col">
        <div className="panel">
          <h3>Analytics</h3>
          <div className="bars">
            {(analytics.hourlyPassengers || []).map((h) => (
              <div key={h.hour} className="bar-row">
                <span>{h.hour}:00</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(100, h.passengers * 10)}%` }} />
                </div>
                <span>{h.passengers}</span>
              </div>
            ))}
          </div>
          <p><strong>Peak hours:</strong> {peakSummary || 'N/A'}</p>
        </div>

        <div className="panel">
          <h3>Terminal Distribution</h3>
          {(analytics.terminalDistribution || []).map((t) => (
            <div key={t.terminal} className="bar-row">
              <span>{t.terminal}</span>
              <div className="bar-track">
                <div className="bar-fill green" style={{ width: `${Math.min(100, t.count * 10)}%` }} />
              </div>
              <span>{t.count}</span>
            </div>
          ))}
          {!canManage && (
            <small>Viewer role: read-only access</small>
          )}
        </div>
      </section>
    </div>
  );
};

export default OperationsDashboard;

