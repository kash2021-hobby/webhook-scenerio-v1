import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'database', 'webhooks.db');

async function resetPassword() {
  console.log('Resetting password for user1@gmail.com...');
  
  // Initialize SQL.js
  const SQL = await initSqlJs();
  
  // Load database
  let database;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    database = new SQL.Database(buffer);
  } else {
    console.error('Database not found!');
    return;
  }
  
  const email = 'user1@gmail.com';
  const newPassword = '@user123';
  
  // Check if user exists (using parameterized query)
  const stmt = database.prepare('SELECT id, email FROM users WHERE email = ?');
  stmt.bind([email]);
  const userResult = [];
  while (stmt.step()) {
    userResult.push(stmt.getAsObject());
  }
  stmt.free();
  
  if (userResult.length === 0) {
    console.error('❌ User not found!');
    console.log('Creating user...');
    
    // Create user if doesn't exist
    const { v4: uuidv4 } = await import('uuid');
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    const insertStmt = database.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)');
    insertStmt.run([userId, email, passwordHash]);
    insertStmt.free();
    
    console.log('✅ User created!');
    console.log('Email:', email);
    console.log('Password:', newPassword);
  } else {
    console.log('✅ User found:', userResult[0]);
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    console.log('New password hash generated');
    
    // Update password (using parameterized query)
    const updateStmt = database.prepare('UPDATE users SET password_hash = ? WHERE email = ?');
    updateStmt.run([passwordHash, email]);
    updateStmt.free();
    console.log('Password updated!');
    
    // Verify the update
    const verifyStmt = database.prepare('SELECT email FROM users WHERE email = ?');
    verifyStmt.bind([email]);
    const verifyResult = [];
    while (verifyStmt.step()) {
      verifyResult.push(verifyStmt.getAsObject());
    }
    verifyStmt.free();
    
    if (verifyResult.length > 0) {
      console.log('✅ Password reset successful!');
      console.log('Email:', email);
      console.log('Password:', newPassword);
    }
  }
  
  // Save database
  const data = database.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
  
  database.close();
  console.log('Database saved!');
}

resetPassword().catch(console.error);
