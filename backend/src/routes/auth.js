const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { getUniqIdValue } = require('../utils/uniqueId');
const { sendVerificationEmail } = require('../utils/mailer');

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};


  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid e-mail address is required.' });
  }
  if (!password || password.length < 1) {
    return res.status(400).json({ error: 'Password cannot be empty.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = getUniqIdValue();

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, status, verification_token)
       VALUES ($1, $2, $3, 'unverified', $4)
       RETURNING id, name, email, status, registration_time`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, verificationToken]
    );

    const user = result.rows[0];

    sendVerificationEmail(user.email, verificationToken).catch((err) => {
      console.error('Failed to send verification e-mail:', err.message);
    });

    return res.status(201).json({
      message: 'Registration successful! Please check your e-mail to confirm your account.',
      user: { id: user.id, name: user.name, email: user.email, status: user.status },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This e-mail address is already registered.' });
    }
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed due to a server error.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail and password are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid e-mail or password.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'This account has been blocked.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid e-mail or password.' });
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTIONS);

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, name: user.name, email: user.email, status: user.status },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  try {
    const result = await pool.query('SELECT id, status FROM users WHERE verification_token = $1', [token]);
    const user = result.rows[0];

    if (!user) {
      return res.redirect(`${clientUrl}/login?verify=invalid`);
    }

 
    if (user.status === 'unverified') {
      await pool.query(
        "UPDATE users SET status = 'active', verification_token = NULL WHERE id = $1",
        [user.id]
      );
    }

    return res.redirect(`${clientUrl}/login?verify=success`);
  } catch (err) {
    console.error('Verification error:', err);
    return res.redirect(`${clientUrl}/login?verify=error`);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  return res.json({ message: 'Logged out.' });
});

router.get('/me', authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
