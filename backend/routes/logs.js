import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database/db.js';

const router = express.Router();

router.use(authenticateToken);

// Get logs for a webhook
router.get('/webhook/:webhookId', (req, res) => {
  try {
    const { webhookId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    // Verify webhook belongs to user
    const webhook = db.prepare(`
      SELECT id FROM webhooks WHERE id = ? AND user_id = ?
    `).get(webhookId, req.user.userId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const logs = db.prepare(`
      SELECT l.*, d.type as destination_type, d.config as destination_config
      FROM delivery_logs l
      LEFT JOIN destinations d ON l.destination_id = d.id
      WHERE l.webhook_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(webhookId, limit);

    res.json(logs);
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all logs for user
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    const logs = db.prepare(`
      SELECT l.*, w.name as webhook_name, d.type as destination_type
      FROM delivery_logs l
      JOIN webhooks w ON l.webhook_id = w.id
      LEFT JOIN destinations d ON l.destination_id = d.id
      WHERE w.user_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(req.user.userId, limit);

    res.json(logs);
  } catch (error) {
    console.error('Get all logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
