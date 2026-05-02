import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

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
      <h3>Live Map (Dubai)</h3>
      <div className="map-box">
        {points.map((v) => (
          <div
            key={`${v.id}-${v.updated_at}`}
            className="map-point"
            title={`${v.id} | ${v.status} | ${v.driver || 'N/A'}`}
            style={{ left: `${v.map_x * 100}%`, top: `${v.map_y * 100}%` }}
          />
        ))}
      </div>
      <small>Click dots to inspect vehicle details (tooltip enabled)</small>
    </div>
  );
};

const OperationsDashboard = ({ auth, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [analytics, setAnalytics] = useState({ hourlyPassengers: [], peakHours: [], terminalDistribution: [] });
  const [q, setQ] = useState('');

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
          <h3>Vehicle List</h3>
          <table>
            <thead>
              <tr>
                <th>Vehicle ID</th>
                <th>Driver</th>
                <th>Passengers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.slice(0, 12).map((v) => (
                <tr key={`${v.id}-${v.updated_at}`}>
                  <td>{v.id}</td>
                  <td>{v.driver || 'N/A'}</td>
                  <td>{v.passengers ?? 0}</td>
                  <td>{v.status || 'Unknown'}</td>
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

