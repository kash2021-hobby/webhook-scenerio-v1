import { google } from 'googleapis';
import db from '../database/db.js';
import { getGoogleAuthClient } from './destination-helpers.js';

export async function deliverToGoogleSheets(destination, mappedData, config) {
  console.log(`   📊 Google Sheets delivery starting...`);
  console.log(`   Config:`, JSON.stringify(config, null, 2));
  console.log(`   Mapped data:`, JSON.stringify(mappedData, null, 2));
  
  const { spreadsheetId, worksheetName } = config;

  if (!spreadsheetId || !worksheetName) {
    throw new Error('Missing spreadsheetId or worksheetName in config');
  }

  // Get user ID from webhook
  const webhook = db.prepare('SELECT user_id FROM webhooks WHERE id = ?').get(destination.webhook_id);
  if (!webhook) {
    throw new Error('Webhook not found');
  }

  console.log(`   🔐 Getting Google auth for user ${webhook.user_id}`);
  const auth = await getGoogleAuthClient(webhook.user_id);
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`   📋 Getting headers from ${worksheetName}!1:1`);
  // Get column headers to determine order
  const headersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!1:1`
  });

  const headers = headersResponse.data.values?.[0] || [];
  console.log(`   📝 Headers found: ${headers.join(', ')}`);
  
  if (headers.length === 0) {
    throw new Error('No headers found in worksheet. Make sure the first row contains column headers.');
  }
  
  // Build row in correct column order
  const row = headers.map(header => {
    const value = mappedData[header] ?? '';
    console.log(`   🔗 Column "${header}": ${value}`);
    return value;
  });

  console.log(`   ➕ Appending row:`, row);
  
  // Append row
  const appendResponse = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${worksheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row]
    }
  });
  
  console.log(`   ✅ Successfully appended row to Google Sheets`);
  console.log(`   Response:`, JSON.stringify(appendResponse.data, null, 2));
}
