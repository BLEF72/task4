const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;


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
    -- NOTA BENE: This unique index is the database-level guarantee of email uniqueness.
    -- It is NOT a primary key — it is a separate unique index on the email column.
    -- This ensures consistency regardless of how many sources push data simultaneously.
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email);
  `);
  console.log('Database initialized with unique index on email');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
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
    html: `<p>Hello ${name},</p>
           <p>Click <a href="${link}">here</a> to verify your email address.</p>
           <p>If you did not register, ignore this email.</p>`,
  }).catch(err => console.error('Email send error (non-critical):', err));
}


app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'none',
},
}));

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const result = await pool.query('SELECT id, status FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
     
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found', redirect: true });
    }
    const user = result.rows[0];
    if (user.status === 'blocked') {
     
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Account is blocked', redirect: true });
    }
    req.currentUser = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Server error' });
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
    const newUser = result.rows[0];
    
    sendVerificationEmailAsync(newUser.email, newUser.name, token);
    res.status(201).json({
      message: 'Registration successful! Check your email to verify your account.',
      user: newUser,
    });
  } catch (err) {
  
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
    req.session.userId = user.id;
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        last_login: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=invalid_token');
  }
  try {
    const result = await pool.query(
      `UPDATE users
       SET status = CASE WHEN status = 'unverified' THEN 'active' ELSE status END,
           verification_token = NULL
       WHERE verification_token = $1
       RETURNING id`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=invalid_token');
    }
    res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?verified=1');
  } catch (err) {
    console.error('Verify error:', err);
    res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/login?error=server_error');
  }
});


app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, status, last_login, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, status, last_login, created_at
       FROM users
       ORDER BY last_login DESC NULLS LAST, created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});


function getUniqIdValue(user) {
  return user.id;
}

app.post('/api/users/block', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No users selected' });
  }
  try {
    await pool.query(
      `UPDATE users SET status = 'blocked' WHERE id = ANY($1::int[]) AND status != 'blocked'`,
      [ids]
    );
    res.json({ message: `${ids.length} user(s) blocked successfully` });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: 'Failed to block users' });
  }
});

app.post('/api/users/unblock', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No users selected' });
  }
  try {
    await pool.query(
      `UPDATE users SET status = 'active' WHERE id = ANY($1::int[]) AND status = 'blocked'`,
      [ids]
    );
    res.json({ message: `${ids.length} user(s) unblocked successfully` });
  } catch (err) {
    console.error('Unblock error:', err);
    res.status(500).json({ error: 'Failed to unblock users' });
  }
});


app.delete('/api/users', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No users selected' });
  }
  try {
    
    await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
    res.json({ message: `${ids.length} user(s) deleted successfully` });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete users' });
  }
});


app.delete('/api/users/unverified', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM users WHERE status = 'unverified' RETURNING id`);
    res.json({ message: `${result.rows.length} unverified user(s) deleted` });
  } catch (err) {
    console.error('Delete unverified error:', err);
    res.status(500).json({ error: 'Failed to delete unverified users' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
