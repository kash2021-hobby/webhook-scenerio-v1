# Fix Google OAuth with ngrok

## Problem
Google OAuth is failing because the redirect URI doesn't match what's configured in Google Cloud Console.

## Solution

### Step 1: Update Backend Environment

Add to `backend/.env`:

```env
NGROK_URL=https://unreciprocated-rebekah-proverbially.ngrok-free.dev
GOOGLE_REDIRECT_URI=https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback
```

### Step 2: Update Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to: **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, add:
   ```
   https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback
   ```
6. **Save** the changes

### Step 3: Restart Backend Server

Restart your backend server to pick up the new environment variables.

### Step 4: Test Again

Try connecting Google Sheets again. It should work now!

## Important Notes

- **ngrok URL changes**: Every time you restart ngrok, you get a new URL. You'll need to:
  1. Update `NGROK_URL` in `backend/.env`
  2. Update the redirect URI in Google Cloud Console
  3. Restart the backend server

- **For production**: Use a permanent URL (Railway, Render, etc.) to avoid this issue.
