import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database/db.js';

const router = express.Router();

router.use(authenticateToken);

// Get mappings for a destination
router.get('/destination/:destinationId', (req, res) => {
  try {
    const { destinationId } = req.params;

    // Verify destination belongs to user
    const destination = db.prepare(`
      SELECT d.* FROM destinations d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.id = ? AND w.user_id = ?
    `).get(destinationId, req.user.userId);

    if (!destination) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    const mappings = db.prepare(`
      SELECT * FROM field_mappings
      WHERE destination_id = ?
    `).all(destinationId);

    res.json(mappings);
  } catch (error) {
    console.error('Get mappings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set mappings for a destination (replace all)
router.post('/destination/:destinationId', (req, res) => {
  try {
    const { destinationId } = req.params;
    const { mappings } = req.body; // Array of { webhookField, destinationField }

    console.log('Saving mappings for destination:', destinationId);
    console.log('Mappings received:', JSON.stringify(mappings, null, 2));

    if (!Array.isArray(mappings)) {
      console.error('Mappings is not an array:', typeof mappings);
      return res.status(400).json({ error: 'Mappings must be an array' });
    }

    // Verify destination belongs to user
    const destination = db.prepare(`
      SELECT d.* FROM destinations d
      JOIN webhooks w ON d.webhook_id = w.id
      WHERE d.id = ? AND w.user_id = ?
    `).get(destinationId, req.user.userId);

    if (!destination) {
      console.error('Destination not found or access denied:', destinationId);
      return res.status(404).json({ error: 'Destination not found' });
    }

    // Delete existing mappings
    const deleteResult = db.prepare('DELETE FROM field_mappings WHERE destination_id = ?').run(destinationId);
    console.log(`Deleted ${deleteResult.changes} existing mappings`);

    // Filter out empty mappings (where webhookField is not set)
    const validMappings = mappings.filter(m => m.webhookField && m.webhookField.trim() !== '');

    if (validMappings.length === 0) {
      console.warn('No valid mappings to save');
      return res.status(400).json({ error: 'At least one mapping is required' });
    }

    console.log(`Saving ${validMappings.length} valid mappings`);

    // Insert new mappings - sql.js doesn't support transactions the same way
    // So we'll insert them one by one and handle errors
    const insertMapping = db.prepare(`
      INSERT INTO field_mappings (id, destination_id, webhook_field, destination_field)
      VALUES (?, ?, ?, ?)
    `);

    for (const mapping of validMappings) {
      try {
        const mappingId = uuidv4();
        insertMapping.run(
          mappingId, 
          destinationId, 
          mapping.webhookField, 
          mapping.destinationField
        );
        console.log(`Saved mapping: ${mapping.webhookField} -> ${mapping.destinationField}`);
      } catch (insertError) {
        console.error('Error inserting mapping:', insertError);
        console.error('Mapping data:', mapping);
        throw new Error(`Failed to insert mapping: ${insertError.message}`);
      }
    }

    // Verify saved mappings
    const savedMappings = db.prepare(`
      SELECT * FROM field_mappings WHERE destination_id = ?
    `).all(destinationId);

    console.log(`Successfully saved ${savedMappings.length} mappings`);
    
    res.json(savedMappings);
  } catch (error) {
    console.error('Set mappings error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
