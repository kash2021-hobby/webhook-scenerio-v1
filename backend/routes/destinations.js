import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database/db.js';
import { getGoogleSheetsColumns, getSupabaseColumns, verifySupabaseConnection, getSupabaseTables } from '../services/destination-helpers.js';

const router = express.Router();

router.use(authenticateToken);

// Get all destinations for a webhook
router.get('/webhook/:webhookId', (req, res) => {
  try {
    const { webhookId } = req.params;

    // Verify webhook belongs to user
    const webhook = db.prepare(`
      SELECT id FROM webhooks WHERE id = ? AND user_id = ?
    `).get(webhookId, req.user.userId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const destinations = db.prepare(`
      SELECT * FROM destinations WHERE webhook_id = ?
    `).all(webhookId);

    res.json(destinations);
  } catch (error) {
    console.error('Get destinations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create destination
router.post('/', async (req, res) => {
  try {
    const { webhookId, type, config } = req.body;

    if (!webhookId || !type || !config) {
      return res.status(400).json({ error: 'webhookId, type, and config required' });
    }

    if (!['google_sheets', 'supabase'].includes(type)) {
      return res.status(400).json({ error: 'Invalid destination type' });
    }

    // Verify webhook belongs to user
    const webhook = db.prepare(`
      SELECT id FROM webhooks WHERE id = ? AND user_id = ?
    `).get(webhookId, req.user.userId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO destinations (id, webhook_id, type, config)
      VALUES (?, ?, ?, ?)
    `).run(id, webhookId, type, JSON.stringify(config));

    const destination = db.prepare('SELECT * FROM destinations WHERE id = ?').get(id);
    res.status(201).json(destination);
  } catch (error) {
    console.error('Create destination error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update destination
router.put('/:id', (req, res) => {
  try {
    const { enabled, config } = req.body;

    // Verify destination belongs to user's webhook
    const destination = db.prepare(`
      SELECT d.* FROM destinations d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.id = ? AND w.user_id = ?
    `).get(req.params.id, req.user.userId);

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (enabled !== undefined) {
      updateFields.push('enabled = ?');
      updateValues.push(enabled ? 1 : 0);
    }

    if (config !== undefined) {
      updateFields.push('config = ?');
      updateValues.push(JSON.stringify(config));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.params.id);

    db.prepare(`
      UPDATE destinations
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).run(...updateValues);

    const updated = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Update destination error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete destination
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM destinations
      WHERE id IN (
        SELECT d.id FROM destinations d
        JOIN webhooks w ON d.webhook_id = w.id
        WHERE d.id = ? AND w.user_id = ?
      )
    `).run(req.params.id, req.user.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    res.json({ message: 'Destination deleted' });
  } catch (error) {
    console.error('Delete destination error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify Supabase connection
router.post('/verify/supabase', async (req, res) => {
  try {
    const { supabaseUrl, serviceRoleKey } = req.body;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(400).json({ error: 'supabaseUrl and serviceRoleKey required' });
    }

    const result = await verifySupabaseConnection(supabaseUrl, serviceRoleKey);
    
    res.json(result);
  } catch (error) {
    console.error('Verify Supabase error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify Supabase connection' });
  }
});

// Get Supabase tables (for table selection)
router.post('/supabase/tables', async (req, res) => {
  try {
    const { supabaseUrl, serviceRoleKey } = req.body;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(400).json({ error: 'supabaseUrl and serviceRoleKey required' });
    }

    const result = await getSupabaseTables(supabaseUrl, serviceRoleKey);
    
    res.json(result);
  } catch (error) {
    console.error('Get Supabase tables error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Supabase tables' });
  }
});

// Get Supabase columns for a table
router.post('/supabase/columns', async (req, res) => {
  try {
    const { supabaseUrl, serviceRoleKey, tableName } = req.body;

    if (!supabaseUrl || !serviceRoleKey || !tableName) {
      return res.status(400).json({ error: 'supabaseUrl, serviceRoleKey, and tableName required' });
    }

    const columns = await getSupabaseColumns(supabaseUrl, serviceRoleKey, tableName);
    
    res.json({ columns });
  } catch (error) {
    console.error('Get Supabase columns error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Supabase columns' });
  }
});

// Get destination columns (for mapping)
router.get('/:id/columns', async (req, res) => {
  try {
    const destination = db.prepare(`
      SELECT d.* FROM destinations d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.id = ? AND w.user_id = ?
    `).get(req.params.id, req.user.userId);

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    const config = JSON.parse(destination.config);
    let columns = [];

    if (destination.type === 'google_sheets') {
      // Get Google Sheets columns
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.userId);
      columns = await getGoogleSheetsColumns(user.id, config.spreadsheetId, config.worksheetName);
    } else if (destination.type === 'supabase') {
      // Get Supabase columns
      columns = await getSupabaseColumns(config.supabaseUrl, config.serviceRoleKey, config.tableName);
    }

    res.json({ columns });
  } catch (error) {
    console.error('Get columns error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
