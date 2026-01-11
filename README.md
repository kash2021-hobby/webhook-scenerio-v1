# Webhook Router

A production-ready web application that receives data via unique webhooks and routes that data to multiple destinations (Google Sheets and Supabase).

## Features

- **User Authentication**: Email + password authentication with JWT
- **Unique Webhook URLs**: Generate unique webhook endpoints per user
- **Multiple Destinations**: Route webhook data to Google Sheets and Supabase
- **Field Mapping**: Map webhook fields to destination columns
- **Independent Delivery**: Each destination processes independently (failures don't block others)
- **Retry Logic**: Automatic retry for failed deliveries
- **Comprehensive Logging**: Track all delivery attempts and statuses

## Tech Stack

### Frontend
- React 18
- Tailwind CSS
- React Router

### Backend
- Node.js
- Express
- SQLite (better-sqlite3)
- JWT Authentication
- Google OAuth 2.0
- Google Sheets API
- Supabase REST API

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Google Cloud Console account (for Google Sheets integration)
- Supabase account (for Supabase integration)

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Backend Configuration

1. Copy the example environment file:
```bash
cd backend
cp .env.example .env
```

2. Edit `backend/.env` and configure:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

FRONTEND_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Sheets API
   - Google Drive API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure OAuth consent screen:
   - User Type: External
   - App name: Webhook Router
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
6. Copy the Client ID and Client Secret to your `.env` file

### 4. Supabase Setup

1. Go to [Supabase](https://supabase.com/) and create a new project
2. Go to Project Settings → API
3. Copy your:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Service Role Key (keep this secret!)
4. Create a table in your Supabase database that you want to receive webhook data

### 5. Database Initialization

The database will be automatically created when you first run the backend server. The schema is defined in `backend/database/schema.sql`.

### 6. Run the Application

#### Development Mode (runs both frontend and backend):

```bash
# From root directory
npm run dev
```

#### Or run separately:

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend:**
```bash
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Usage

### 1. Create an Account

1. Navigate to http://localhost:3000
2. Sign up with your email and password
3. Log in

### 2. Create a Webhook

1. Go to Dashboard
2. Click "+ New Webhook"
3. Enter a name for your webhook
4. Copy the generated webhook URL

### 3. Configure Destinations

#### Google Sheets Destination:

1. Click "Add Destination" → Select "Google Sheets"
2. Click "Connect Google Account" (first time only)
3. Select a spreadsheet and worksheet
4. Click "Create"
5. Click "Map Fields" to configure field mappings
6. Enable the destination

#### Supabase Destination:

1. Click "Add Destination" → Select "Supabase"
2. Enter:
   - Supabase URL
   - Service Role Key
   - Table Name
   - Conflict Key (optional, for upserts)
3. Click "Create"
4. Click "Map Fields" to configure field mappings
5. Enable the destination

### 4. Test Your Webhook

Send a POST request to your webhook URL:

```bash
curl -X POST http://localhost:5000/api/webhook/receive/{userId}/{webhookId} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30
  }'
```

Replace `{userId}` and `{webhookId}` with your actual values from the webhook detail page.

### 5. View Logs

Navigate to the "Logs" page to see delivery status for all webhook events.

## Project Structure

```
.
├── backend/
│   ├── database/
│   │   ├── db.js              # Database connection
│   │   └── schema.sql          # Database schema
│   ├── middleware/
│   │   └── auth.js             # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   ├── webhooks.js         # Webhook management routes
│   │   ├── destinations.js     # Destination management routes
│   │   ├── mappings.js         # Field mapping routes
│   │   ├── logs.js             # Log viewing routes
│   │   └── google-auth.js      # Google OAuth routes
│   ├── services/
│   │   ├── delivery.js         # Main delivery orchestration
│   │   ├── google-sheets-delivery.js
│   │   ├── supabase-delivery.js
│   │   └── destination-helpers.js
│   ├── utils/
│   │   └── flatten.js          # Payload flattening utility
│   ├── server.js               # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.js
│   │   │   ├── Signup.js
│   │   │   ├── Dashboard.js
│   │   │   ├── WebhookDetail.js
│   │   │   └── Logs.js
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── utils/
│   │   │   └── api.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login

### Webhooks
- `GET /api/webhooks` - List user's webhooks
- `POST /api/webhooks` - Create webhook
- `GET /api/webhooks/:id` - Get webhook details
- `PUT /api/webhooks/:id` - Update webhook
- `DELETE /api/webhooks/:id` - Delete webhook
- `POST /api/webhook/receive/:userId/:webhookId` - **Public webhook receiver**

### Destinations
- `GET /api/destinations/webhook/:webhookId` - List destinations
- `POST /api/destinations` - Create destination
- `PUT /api/destinations/:id` - Update destination
- `DELETE /api/destinations/:id` - Delete destination
- `GET /api/destinations/:id/columns` - Get destination columns

### Mappings
- `GET /api/mappings/destination/:destinationId` - Get mappings
- `POST /api/mappings/destination/:destinationId` - Set mappings

### Logs
- `GET /api/logs` - Get all logs
- `GET /api/logs/webhook/:webhookId` - Get webhook logs

### Google OAuth
- `GET /api/auth/google/url` - Get OAuth URL
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/google/spreadsheets` - List spreadsheets
- `GET /api/auth/google/spreadsheets/:id/worksheets` - List worksheets

## Security Notes

- **JWT_SECRET**: Use a strong, random secret in production
- **Service Role Key**: Never expose Supabase service role keys in frontend code
- **HTTPS**: Use HTTPS in production
- **CORS**: Configure CORS properly for production
- **Rate Limiting**: Consider adding rate limiting for webhook endpoints

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper CORS origins
4. Use environment variables for all secrets
5. Set up HTTPS
6. Consider using a production database (PostgreSQL) instead of SQLite
7. Add rate limiting
8. Set up monitoring and logging

## Troubleshooting

### Google OAuth not working
- Verify redirect URI matches exactly in Google Cloud Console
- Check that Google Sheets API and Drive API are enabled
- Ensure OAuth consent screen is configured

### Supabase connection fails
- Verify the service role key is correct
- Check that the table exists
- Ensure the table has the columns you're trying to map

### Webhook not receiving data
- Verify the webhook URL is correct
- Check that the webhook exists in the database
- Ensure you're sending POST requests with JSON content

## License

MIT
