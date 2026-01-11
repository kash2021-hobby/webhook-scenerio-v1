import express from 'express';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import db from '../database/db.js';

const router = express.Router();

// Use ngrok URL for redirect URI - hardcode for now to ensure it works
// TODO: Make this configurable via environment variables
const redirectUri = 'https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback';

// Validate that credentials are set
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: Google OAuth credentials not found in environment variables!');
  console.error('Please check your backend/.env file has:');
  console.error('  GOOGLE_CLIENT_ID=...');
  console.error('  GOOGLE_CLIENT_SECRET=...');
}

// Initialize OAuth2 client - ensure credentials are set
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('⚠️  WARNING: OAuth2 client initialized without credentials!');
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

// Verify the client was initialized correctly
if (!oauth2Client._clientId) {
  console.error('❌ CRITICAL: OAuth2 client._clientId is undefined!');
  console.error('This means the client was not initialized properly.');
}

console.log('Google OAuth initialized with:');
console.log('  Client ID:', process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'NOT SET');
console.log('  Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 10)}...` : 'NOT SET');
console.log('  Redirect URI:', redirectUri);

// Verify credentials are set
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('\n❌ ERROR: Google OAuth credentials missing!');
  console.error('Please check backend/.env file contains:');
  console.error('  GOOGLE_CLIENT_ID=131818404924-cbics1nu8hfnsa9nqn6b0lranv3efaqq.apps.googleusercontent.com');
  console.error('  GOOGLE_CLIENT_SECRET=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\n');
} else {
  console.log('✅ Google OAuth credentials loaded successfully\n');
}

// Get Google OAuth URL
router.get('/url', authenticateToken, (req, res) => {
  // Check if credentials are set
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('Missing credentials when generating OAuth URL');
    return res.status(500).json({ 
      error: 'Google OAuth not configured. Please check backend/.env file has GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET' 
    });
  }

  // Create OAuth2 client fresh to ensure it has the latest credentials
  const oauthClient = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  // Verify the client was created correctly
  if (!oauthClient._clientId || oauthClient._clientId !== clientId) {
    console.error('OAuth2 client not properly initialized!');
    console.error('Expected Client ID:', clientId);
    console.error('Actual Client ID:', oauthClient._clientId);
    return res.status(500).json({ 
      error: 'OAuth2 client initialization failed. Check server logs.' 
    });
  }

  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.readonly'
  ];

  try {
    const url = oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: req.user.userId, // Pass user ID in state
      prompt: 'consent'
    });

    console.log('Generated OAuth URL:');
    console.log('  Client ID:', clientId);
    console.log('  Redirect URI:', redirectUri);
    console.log('  Generated URL (first 150 chars):', url.substring(0, 150));
    
    // Verify URL contains client_id
    if (!url.includes('client_id=')) {
      console.error('ERROR: Generated URL does not contain client_id!');
      console.error('Full URL:', url);
      return res.status(500).json({ 
        error: 'OAuth URL generation failed - client_id missing' 
      });
    }
    
    // Verify URL contains the correct client_id
    if (!url.includes(clientId)) {
      console.error('ERROR: Generated URL does not contain the correct client_id!');
      console.error('Expected client_id in URL:', clientId);
      return res.status(500).json({ 
        error: 'OAuth URL generation failed - incorrect client_id' 
      });
    }
    
    res.json({ url });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL: ' + error.message });
  }
});

// Google OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error('Google OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?error=oauth_denied`);
    }

    if (!code || !state) {
      console.error('Missing code or state in OAuth callback');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?error=oauth_failed`);
    }

    // Create fresh OAuth2 client with credentials
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('OAuth credentials missing in callback');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?error=oauth_config_error`);
    }

    const callbackOAuthClient = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    console.log('Exchanging OAuth code for tokens...');
    const { tokens } = await callbackOAuthClient.getToken(code);
    callbackOAuthClient.setCredentials(tokens);

    // Extract userId and return URL from state
    const stateParts = state.split('|');
    const userId = stateParts[0];
    const returnUrl = stateParts[1] ? decodeURIComponent(stateParts[1]) : null;
    
    console.log('Storing tokens for user:', userId);
    console.log('Return URL:', returnUrl);

    // Store tokens
    const existing = db.prepare('SELECT id FROM google_tokens WHERE user_id = ?').get(userId);
    
    if (existing) {
      db.prepare(`
        UPDATE google_tokens
        SET access_token = ?, refresh_token = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || null,
        userId
      );
      console.log('Updated existing Google tokens');
    } else {
      db.prepare(`
        INSERT INTO google_tokens (id, user_id, access_token, refresh_token, expiry_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        userId,
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || null
      );
      console.log('Created new Google tokens');
    }

    console.log('✅ Google OAuth successful! Redirecting...');
    
    // Redirect back to the webhook page if we have a return URL, otherwise go to dashboard
    const redirectUrl = returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?google_connected=true`;
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?error=oauth_failed&details=${encodeURIComponent(error.message)}`);
  }
});

// Get user's Google spreadsheets
router.get('/spreadsheets', authenticateToken, async (req, res) => {
  try {
    const tokens = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.userId);
    
    if (!tokens) {
      return res.status(401).json({ error: 'Google not connected. Please connect your Google account first.' });
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name)',
      pageSize: 100
    });

    res.json({ spreadsheets: response.data.files || [] });
  } catch (error) {
    console.error('Get spreadsheets error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch spreadsheets' });
  }
});

// Get worksheets for a spreadsheet
router.get('/spreadsheets/:spreadsheetId/worksheets', authenticateToken, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;

    const tokens = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(req.user.userId);
    
    if (!tokens) {
      return res.status(401).json({ error: 'Google not connected' });
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    const worksheets = response.data.sheets.map(sheet => ({
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title
    }));

    res.json({ worksheets });
  } catch (error) {
    console.error('Get worksheets error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch worksheets' });
  }
});

export default router;
