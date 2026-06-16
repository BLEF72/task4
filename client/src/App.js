import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './utils/api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';


export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);


  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get('/api/me');
      setCurrentUser(res.data.user);
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const logout = async () => {
    try { await api.post('/api/logout'); } catch {}
    setCurrentUser(null);
  };

  const handleAuthError = useCallback(() => {
    setCurrentUser(null);
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, logout, handleAuthError }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={currentUser ? <Navigate to="/dashboard" replace /> : <LoginPage />}
          />
          <Route
            path="/register"
            element={currentUser ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
          />
          <Route
            path="/dashboard"
            element={currentUser ? <DashboardPage /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to={currentUser ? '/dashboard' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
