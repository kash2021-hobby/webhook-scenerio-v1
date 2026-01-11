# ngrok Setup Guide

Your ngrok URL: `https://unreciprocated-rebekah-proverbially.ngrok-free.dev`

## Step 1: Update Backend Environment

Add or update `backend/.env`:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-here

# Allow both localhost and ngrok
FRONTEND_URL=http://localhost:3000

# ngrok URL (for webhook endpoints)
NGROK_URL=https://unreciprocated-rebekah-proverbially.ngrok-free.dev

# Google OAuth (update redirect URI)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback
```

## Step 2: Update Backend CORS

The backend needs to allow requests from ngrok. Update `backend/server.js` CORS configuration.

## Step 3: Update Frontend Environment

Create `frontend/.env`:

```env
REACT_APP_API_URL=https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api
```

## Step 4: Restart Servers

1. Restart backend server
2. Restart frontend server (or it will auto-reload)

## Step 5: Test

1. Visit: `https://unreciprocated-rebekah-proverbially.ngrok-free.dev/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

2. Your webhook URLs will now be:
   - `https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/webhook/receive/{userId}/{webhookId}`

## Important Notes

- **ngrok free tier**: URL changes every time you restart ngrok
- **ngrok warning page**: Free tier shows a warning page on first visit (users need to click "Visit Site")
- **For production**: Consider Railway, Render, or Vercel for permanent URLs

## Update Google OAuth

If using Google OAuth, update your Google Cloud Console:
1. Go to OAuth 2.0 Client settings
2. Add authorized redirect URI: `https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback`
