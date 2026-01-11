import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Set up axios defaults
axios.defaults.baseURL = API_URL;

// Request interceptor: Add token to every request
axios.interceptors.request.use(
  (config) => {
    // Get fresh token from localStorage on every request
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors gracefully
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Only handle 401 if it's an authentication error (not Google OAuth)
    // Don't auto-logout on 401 - let individual components handle it
    if (error.response?.status === 401) {
      // Check if it's a JWT/auth error (not Google OAuth)
      const isAuthError = error.config?.url?.includes('/auth/google') === false;
      
      if (isAuthError) {
        console.warn('⚠️ 401 Unauthorized - Token may be invalid or expired');
        // Don't auto-logout here - let the component handle it
        // This prevents accidental logouts on network errors
      }
    }
    return Promise.reject(error);
  }
);

export default axios;
