import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

console.log('='.repeat(60));
console.log('Environment Variables Check');
console.log('='.repeat(60));
console.log('\n.env file path:', envPath);
console.log('.env file exists:', existsSync(envPath) ? '✅ YES' : '❌ NO');
console.log('\nGoogle OAuth Credentials:');
console.log('-'.repeat(60));

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.NGROK_URL 
  ? `${process.env.NGROK_URL}/api/auth/google/callback`
  : 'http://localhost:5000/api/auth/google/callback';

console.log('GOOGLE_CLIENT_ID:', clientId ? `✅ ${clientId.substring(0, 30)}...` : '❌ NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', clientSecret ? `✅ ${clientSecret.substring(0, 10)}...` : '❌ NOT SET');
console.log('Redirect URI:', redirectUri);

console.log('\n' + '='.repeat(60));
if (clientId && clientSecret) {
  console.log('✅ All credentials are set correctly!');
} else {
  console.log('❌ Missing credentials! Please check your .env file.');
  console.log('\nRequired in backend/.env:');
  console.log('  GOOGLE_CLIENT_ID=131818404924-cbics1nu8hfnsa9nqn6b0lranv3efaqq.apps.googleusercontent.com');
  console.log('  GOOGLE_CLIENT_SECRET=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');
}
console.log('='.repeat(60));
