import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'database', 'webhooks.db');
const schemaPath = join(__dirname, '..', 'database', 'schema.sql');

async function initializeDatabase() {
  console.log('Initializing database...');
  
  // Initialize SQL.js
  const SQL = await initSqlJs();
  
  // Load or create database
  let database;
  if (existsSync(dbPath)) {
    console.log('Loading existing database...');
    const buffer = readFileSync(dbPath);
    database = new SQL.Database(buffer);
  } else {
    console.log('Creating new database...');
    database = new SQL.Database();
  }
  
  // Execute schema
  if (existsSync(schemaPath)) {
    console.log('Executing schema...');
    const schema = readFileSync(schemaPath, 'utf-8');
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (!statement) continue;
      try {
        database.exec(statement);
        console.log(`✓ Executed: ${statement.substring(0, 60)}...`);
      } catch (error) {
        const errorMsg = error.message.toLowerCase();
        if (!errorMsg.includes('already exists') && !errorMsg.includes('duplicate')) {
          console.error(`✗ Error: ${error.message}`);
          console.error(`Statement: ${statement}`);
        }
      }
    }
  }
  
  // Verify tables exist
  try {
    const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (tables.length > 0 && tables[0].values.length > 0) {
      const tableNames = tables[0].values.map(row => row[0]);
      console.log('\n✓ Tables found:', tableNames.join(', '));
    } else {
      console.error('\n✗ ERROR: No tables found! Creating all tables manually...');
      
      // Create all tables manually
      const tables = [
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS webhooks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          webhook_id TEXT UNIQUE NOT NULL,
          latest_payload TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS destinations (
          id TEXT PRIMARY KEY,
          webhook_id TEXT NOT NULL,
          type TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          config TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS field_mappings (
          id TEXT PRIMARY KEY,
          destination_id TEXT NOT NULL,
          webhook_field TEXT NOT NULL,
          destination_field TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS delivery_logs (
          id TEXT PRIMARY KEY,
          webhook_id TEXT NOT NULL,
          destination_id TEXT,
          payload TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS google_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expiry_date INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];
      
      for (const tableSQL of tables) {
        try {
          database.exec(tableSQL);
          const tableName = tableSQL.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
          console.log(`✓ Created ${tableName} table`);
        } catch (error) {
          console.error(`✗ Error creating table: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error('Error verifying tables:', error.message);
  }
  
  // Create dummy user
  console.log('\nCreating dummy user...');
  const email = 'user1@gmail.com';
  const password = '@user123';
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  
  try {
    // Check if user already exists
    const checkUser = database.exec(`SELECT id FROM users WHERE email = '${email}'`);
    if (checkUser.length > 0 && checkUser[0].values.length > 0) {
      console.log('User already exists, skipping...');
    } else {
      database.exec(`INSERT INTO users (id, email, password_hash) VALUES ('${userId}', '${email}', '${passwordHash}')`);
      console.log(`✓ Created user: ${email} / ${password}`);
    }
  } catch (error) {
    console.error('Error creating user:', error.message);
  }
  
  // Save database
  const data = database.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
  
  console.log('\n✓ Database initialized and saved!');
  database.close();
}

initializeDatabase().catch(console.error);
