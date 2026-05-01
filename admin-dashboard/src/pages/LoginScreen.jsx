import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';

const LoginScreen = ({ auth, onLogin }) => {
  const [email, setEmail] = useState('admin@cityterminal.ae');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth?.token) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/admin/auth/login', { email, password });
      onLogin(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>City Terminal Admin</h1>
        <p>Operations + Analytics Dashboard Access</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
        />
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Login'}
        </button>
        <small>Roles: Admin (full), Manager (limited), Viewer (read-only)</small>
      </form>
    </div>
  );
};

export default LoginScreen;

