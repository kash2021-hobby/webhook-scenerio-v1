import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initPromise } from './database/db.js';

dotenv.config();

// Wait for database initialization before starting server
await initPromise;

// Import routes after database is ready
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';
import destinationRoutes from './routes/destinations.js';
import mappingRoutes from './routes/mappings.js';
import logRoutes from './routes/logs.js';
import googleAuthRoutes from './routes/google-auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Allow requests from localhost, frontend URL, and ngrok
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  process.env.NGROK_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('ngrok-free.dev') || origin.includes('ngrok.io')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now (restrict in production)
    }
  },
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/webhook', webhookRoutes); // For webhook receiver (must be before /api/webhooks)
app.use('/api/webhooks', webhookRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/auth/google', googleAuthRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
