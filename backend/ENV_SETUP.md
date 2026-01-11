# Environment Variables Setup

## Create `backend/.env` file

Create a file named `.env` in the `backend` folder with this exact content:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=change-this-to-a-random-secret-key-minimum-32-characters-long

FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=131818404924-cbics1nu8hfnsa9nqn6b0lranv3efaqq.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
```

## Important Notes

1. **File name must be exactly `.env`** (not `.env.txt` or `env.txt`)
2. **File location**: Must be in the `backend` folder (same folder as `server.js`)
3. **No spaces around `=`**: Use `KEY=value` not `KEY = value`
4. **No quotes needed**: Don't wrap values in quotes

## Verify it's working

After creating the file and restarting the server, you should see:

```
Google OAuth initialized with:
  Client ID: 131818404924-cbics1...
  Client Secret: GOCSPX-PV68iw...
  Redirect URI: https://unreciprocated-rebekah-proverbially.ngrok-free.dev/api/auth/google/callback
✅ Google OAuth credentials loaded successfully
```

If you see "NOT SET", the `.env` file isn't being read. Check:
- File name is exactly `.env`
- File is in the `backend` folder
- No typos in variable names
