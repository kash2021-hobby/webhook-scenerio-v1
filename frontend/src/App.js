import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import WebhookDetail from './pages/WebhookDetail';
import Logs from './pages/Logs';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  
  // Don't redirect while loading - wait for auth check to complete
  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }
  
  // Only redirect if user is definitely not logged in (not just on errors)
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/webhook/:id"
            element={
              <PrivateRoute>
                <WebhookDetail />
              </PrivateRoute>
            }
          />
          <Route
            path="/logs"
            element={
              <PrivateRoute>
                <Logs />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
