const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.SESSION_SECRET || 'dev-secret';


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});


async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'unverified',
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verification_token VARCHAR(255)
    );
    -- NOTA BENE: Unique index — database-level email uniqueness guarantee
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email);
  `);
  console.log('Database initialized with unique index on email');
}


const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


function sendVerificationEmailAsync(email, name, token) {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const link = `${baseUrl}/api/verify?token=${token}`;
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify your email',
    html: `<p>Hello ${name},</p><p>Click <a href="${link}">here</a> to verify your email.</p>`,
  }).catch(err => console.error('Email error (non-critical):', err));
}

app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
}));

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // NOTE: Check user still exists and is not blocked on every request
    const result = await pool.query('SELECT id, status FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found', redirect: true });
    }
    if (result.rows[0].status === 'blocked') {
      return res.status(401).json({ error: 'Account is blocked', redirect: true });
    }
    req.currentUser = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', redirect: true });
  }
}


app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const token = uuidv4();
 
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, status, verification_token, created_at)
       VALUES ($1, $2, $3, 'unverified', $4, NOW())
       RETURNING id, name, email, status`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, token]
    );
    sendVerificationEmailAsync(result.rows[0].email, result.rows[0].name, token);
    res.status(201).json({
      message: 'Registration successful! Check your email to verify your account.',
      user: result.rows[0],
    });
  } catch (err) {
    // NOTA BENE: PostgreSQL unique constraint violation code
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Your account has been blocked' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    // NOTE: Sign JWT with 24h expiry
    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token: jwtToken,
      user: { id: user.id, name: user.name, email: user.email, status: user.status, last_login: new Date().toISOString() },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=invalid_token');
  try {
    const result = await pool.query(
      `UPDATE users SET status = CASE WHEN status = 'unverified' THEN 'active' ELSE status END, verification_token = NULL
       WHERE verification_token = $1 RETURNING id`,
      [token]
    );
    if (result.rows.length === 0) return res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=invalid_token');
    res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?verified=1');
  } catch (err) {
    res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=server_error');
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, status, last_login, created_at FROM users WHERE id = $1', [req.currentUser.id]);
  res.json({ user: result.rows[0] });
});

// ── USER MANAGEMENT ROUTES ────────────────────────────────────────────────────

function getUniqIdValue(user) { return user.id; }

app.get('/api/users', requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT id, name, email, status, last_login, created_at FROM users ORDER BY last_login DESC NULLS LAST, created_at DESC`);
  res.json({ users: result.rows });
});

app.post('/api/users/block', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No users selected' });
  await pool.query(`UPDATE users SET status = 'blocked' WHERE id = ANY($1::int[])`, [ids]);
  res.json({ message: `${ids.length} user(s) blocked successfully` });
});

app.post('/api/users/unblock', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No users selected' });
  await pool.query(`UPDATE users SET status = 'active' WHERE id = ANY($1::int[]) AND status = 'blocked'`, [ids]);
  res.json({ message: `${ids.length} user(s) unblocked successfully` });
});

app.delete('/api/users', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No users selected' });
  // NOTA BENE: Hard delete — permanent removal
  await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  res.json({ message: `${ids.length} user(s) deleted successfully` });
});

app.delete('/api/users/unverified', requireAuth, async (req, res) => {
  const result = await pool.query(`DELETE FROM users WHERE status = 'unverified' RETURNING id`);
  res.json({ message: `${result.rows.length} unverified user(s) deleted` });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
