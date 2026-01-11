import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { flattenObject } from '../utils/flatten.js';
import db from '../database/db.js';
import { deliverToDestinations } from '../services/delivery.js';

const router = express.Router();

// Webhook receiver endpoint (public, no auth required) - must be before auth middleware
router.post('/receive/:userId/:webhookId', async (req, res) => {
  try {
    const { userId, webhookId } = req.params;
    const payload = req.body;

    // Find webhook
    const webhook = db.prepare(`
      SELECT * FROM webhooks
      WHERE user_id = ? AND webhook_id = ?
    `).get(userId, webhookId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    // Store latest payload
    const payloadJson = JSON.stringify(payload);
    const updateResult = db.prepare(`
      UPDATE webhooks
      SET latest_payload = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payloadJson, webhook.id);
    
    console.log(`📥 Webhook received for ${webhook.name} (${webhook.id})`);
    console.log(`   Payload keys: ${Object.keys(payload).join(', ')}`);
    console.log(`   Payload stored: ${updateResult.changes > 0 ? 'YES' : 'NO'}`);
    console.log(`   Payload preview: ${payloadJson.substring(0, 200)}...`);

    // Flatten payload
    const flattenedPayload = flattenObject(payload);
    console.log(`   Flattened keys: ${Object.keys(flattenedPayload).join(', ')}`);

    // Deliver to all enabled destinations (fire-and-forget)
    console.log(`   Starting delivery to destinations...`);
    deliverToDestinations(webhook.id, flattenedPayload, payload).catch(err => {
      console.error('❌ Background delivery error:', err);
      console.error('   Error stack:', err.stack);
    });

    // Respond immediately
    res.json({ 
      message: 'Webhook received',
      webhookId: webhook.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Webhook receive error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All other routes require authentication
router.use(authenticateToken);

// Get all webhooks for user
router.get('/', (req, res) => {
  try {
    const webhooks = db.prepare(`
      SELECT id, name, webhook_id, latest_payload, created_at, updated_at
      FROM webhooks
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.userId);

    res.json(webhooks);
  } catch (error) {
    console.error('Get webhooks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new webhook
router.post('/', (req, res) => {
  try {
    const { name } = req.body;

    console.log('📝 Create webhook request received');
    console.log('   Name:', name);
    console.log('   User ID:', req.user?.userId);

    if (!name) {
      console.error('❌ Webhook name missing');
      return res.status(400).json({ error: 'Webhook name required' });
    }

    if (!req.user || !req.user.userId) {
      console.error('❌ User not authenticated');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user exists in database
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
      console.error('❌ User not found in database:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    const id = uuidv4();
    const webhookId = uuidv4().replace(/-/g, '').substring(0, 16);

    console.log('   Generated ID:', id);
    console.log('   Generated webhook_id:', webhookId);

    try {
      const insertResult = db.prepare(`
        INSERT INTO webhooks (id, user_id, name, webhook_id)
        VALUES (?, ?, ?, ?)
      `).run(id, req.user.userId, name, webhookId);

      console.log('   Insert result:', insertResult);
      console.log('   Changes:', insertResult.changes);

      const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id);

      if (!webhook) {
        console.error('❌ Webhook not found after creation');
        return res.status(500).json({ error: 'Failed to retrieve created webhook' });
      }

      console.log('✅ Webhook created successfully:', webhook.id);
      res.status(201).json(webhook);
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      console.error('   Error message:', dbError.message);
      console.error('   Error stack:', dbError.stack);
      throw dbError;
    }
  } catch (error) {
    console.error('❌ Create webhook error:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get webhook by ID
router.get('/:id', (req, res) => {
  try {
    const webhook = db.prepare(`
      SELECT id, name, webhook_id, user_id, latest_payload, created_at, updated_at
      FROM webhooks
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.userId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    console.log(`📤 Returning webhook ${webhook.id} with user_id: ${webhook.user_id}`);
    res.json(webhook);
  } catch (error) {
    console.error('Get webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update webhook
router.put('/:id', (req, res) => {
  try {
    const { name } = req.body;

    const result = db.prepare(`
      UPDATE webhooks
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(name, req.params.id, req.user.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const webhook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(req.params.id);
    res.json(webhook);
  } catch (error) {
    console.error('Update webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete webhook
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM webhooks
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
