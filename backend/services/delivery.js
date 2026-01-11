import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';
import { deliverToGoogleSheets } from './google-sheets-delivery.js';
import { deliverToSupabase } from './supabase-delivery.js';

/**
 * Deliver webhook payload to all enabled destinations
 */
export async function deliverToDestinations(webhookId, flattenedPayload, originalPayload) {
  console.log(`🚀 deliverToDestinations called for webhook ${webhookId}`);
  console.log(`   Flattened payload keys: ${Object.keys(flattenedPayload).join(', ')}`);
  
  // Get all enabled destinations for this webhook
  const destinations = db.prepare(`
    SELECT * FROM destinations
    WHERE webhook_id = ? AND enabled = 1
  `).all(webhookId);

  console.log(`   Found ${destinations.length} enabled destination(s)`);

  if (destinations.length === 0) {
    console.log(`   ⚠️  No enabled destinations found for webhook ${webhookId}`);
    return;
  }

  // Deliver to each destination independently
  for (const destination of destinations) {
    try {
      console.log(`   📤 Delivering to destination ${destination.id} (${destination.type})`);
      await deliverToDestination(destination, flattenedPayload, originalPayload, webhookId);
      console.log(`   ✅ Successfully delivered to destination ${destination.id}`);
    } catch (error) {
      console.error(`   ❌ Delivery failed for destination ${destination.id}:`, error);
      console.error(`   Error details:`, error.message);
      // Continue to next destination
    }
  }
}

/**
 * Deliver to a single destination
 */
async function deliverToDestination(destination, flattenedPayload, originalPayload, webhookId) {
  const config = JSON.parse(destination.config);
  
  console.log(`   🔍 Getting mappings for destination ${destination.id}`);
  
  // Get field mappings
  const mappings = db.prepare(`
    SELECT webhook_field, destination_field
    FROM field_mappings
    WHERE destination_id = ?
  `).all(destination.id);

  console.log(`   📋 Found ${mappings.length} mapping(s) for destination ${destination.id}`);
  
  if (mappings.length === 0) {
    console.log(`   ⚠️  No mappings found for destination ${destination.id}. Skipping delivery.`);
    throw new Error(`No field mappings configured for destination ${destination.id}. Please configure mappings first.`);
  }

  // Create mapping object
  const mappingObj = {};
  for (const mapping of mappings) {
    const value = flattenedPayload[mapping.webhook_field] ?? null;
    mappingObj[mapping.destination_field] = value;
    console.log(`   🔗 Mapping: ${mapping.webhook_field} -> ${mapping.destination_field} = ${value}`);
  }
  
  console.log(`   📦 Mapped data:`, JSON.stringify(mappingObj, null, 2));

  let success = false;
  let errorMessage = null;

  try {
    if (destination.type === 'google_sheets') {
      await deliverToGoogleSheets(destination, mappingObj, config);
      success = true;
    } else if (destination.type === 'supabase') {
      await deliverToSupabase(destination, mappingObj, config);
      success = true;
    }
  } catch (error) {
    errorMessage = error.message;
    console.error(`Delivery error for ${destination.type}:`, error);
  }

  // Log delivery attempt
  const logId = uuidv4();
  db.prepare(`
    INSERT INTO delivery_logs (id, webhook_id, destination_id, payload, status, error_message, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    webhookId,
    destination.id,
    JSON.stringify(originalPayload),
    success ? 'success' : 'failed',
    errorMessage,
    0
  );

  // If failed, retry once
  if (!success && errorMessage) {
    setTimeout(async () => {
      try {
        if (destination.type === 'google_sheets') {
          await deliverToGoogleSheets(destination, mappingObj, config);
        } else if (destination.type === 'supabase') {
          await deliverToSupabase(destination, mappingObj, config);
        }

        // Update log to success
        db.prepare(`
          UPDATE delivery_logs
          SET status = 'success', error_message = NULL, retry_count = 1
          WHERE id = ?
        `).run(logId);
      } catch (retryError) {
        // Update log with retry failure
        db.prepare(`
          UPDATE delivery_logs
          SET status = 'failed', error_message = ?, retry_count = 1
          WHERE id = ?
        `).run(retryError.message, logId);
      }
    }, 5000); // Retry after 5 seconds
  }
}
