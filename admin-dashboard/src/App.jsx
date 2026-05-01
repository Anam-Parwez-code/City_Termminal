import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginScreen from './pages/LoginScreen';
import OperationsDashboard from './pages/OperationsDashboard';
import { setAuthToken } from './api';

const authStorageKey = 'ct_admin_auth';

const readAuth = () => {
  try {
    const raw = localStorage.getItem(authStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (_err) {
    return null;
  }
};

const ProtectedRoute = ({ auth, children }) => {
  if (!auth?.token) return <Navigate to="/login" replace />;
  return children;
};

const App = () => {
  const [auth, setAuth] = useState(() => readAuth());

  useEffect(() => {
    setAuthToken(auth?.token || null);
  }, [auth]);

  const handleLogin = (payload) => {
    const authPayload = { token: payload.token, user: payload.user };
    localStorage.setItem(authStorageKey, JSON.stringify(authPayload));
    setAuth(authPayload);
  };

  const handleLogout = () => {
    localStorage.removeItem(authStorageKey);
    setAuthToken(null);
    setAuth(null);
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginScreen auth={auth} onLogin={handleLogin} />}
      />
      <Route
        path="/dashboard"
        element={(
          <ProtectedRoute auth={auth}>
            <OperationsDashboard auth={auth} onLogout={handleLogout} />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to={auth?.token ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
};

export default App;

