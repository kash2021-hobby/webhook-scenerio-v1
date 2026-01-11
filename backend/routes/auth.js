import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/db.js';

const router = express.Router();

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .run(userId, email, passwordHash);

    // Generate token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: userId, email } });
  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      console.log(`❌ Login attempt failed: User not found for email: ${email}`);
      console.log(`   Available users in database:`, db.prepare('SELECT email FROM users').all().map(u => u.email));
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`🔐 Login attempt for: ${email}`);
    console.log(`   User found: ${user.id}`);
    console.log(`   Password hash exists: ${user.password_hash ? 'YES' : 'NO'}`);

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.log(`❌ Login attempt failed: Invalid password for email: ${email}`);
      console.log(`   Password provided: ${password ? 'YES (length: ' + password.length + ')' : 'NO'}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log(`✅ Password verified successfully for: ${email}`);

    // Generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(`✅ Login successful for: ${email}`);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
