# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install-all
```

Or manually:
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

## Step 2: Configure Backend

1. Create `backend/.env` file:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

**Important**: Replace `JWT_SECRET` with a strong random string. You can generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 3: Google OAuth Setup

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable APIs:
   - Google Sheets API
   - Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
5. Copy Client ID and Client Secret to `backend/.env`

## Step 4: Supabase Setup (Optional)

1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → API
4. Copy:
   - Project URL
   - Service Role Key (secret!)
5. Create a table in your database

## Step 5: Run the Application

```bash
# From root directory
npm run dev
```

This starts both frontend (port 3000) and backend (port 5000).

Or run separately:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm start
```

## Step 6: Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## First Steps

1. Sign up for an account
2. Create a webhook
3. Add a destination (Google Sheets or Supabase)
4. Configure field mappings
5. Test by sending a POST request to your webhook URL

## Testing Your Webhook

```bash
curl -X POST http://localhost:5000/api/webhook/receive/YOUR_USER_ID/YOUR_WEBHOOK_ID \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "data": {
      "nested": "value"
    }
  }'
```

Replace `YOUR_USER_ID` and `YOUR_WEBHOOK_ID` with values from your webhook detail page.

## Troubleshooting

### Database errors
- The database is created automatically on first run
- If issues occur, delete `backend/database/webhooks.db` and restart

### Google OAuth errors
- Verify redirect URI matches exactly
- Check that APIs are enabled
- Ensure OAuth consent screen is configured

### Port already in use
- Change PORT in `backend/.env`
- Update FRONTEND_URL if you change the port
