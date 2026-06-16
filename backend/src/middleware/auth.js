const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

async function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated.', code: 'FORCE_LOGOUT' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
  
    res.clearCookie('token');
    return res.status(401).json({ error: 'Your session has expired. Please log in again.', code: 'FORCE_LOGOUT' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, status, last_login, registration_time FROM users WHERE id = $1',
      [payload.id]
    );
    const user = result.rows[0];


    if (!user) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'This account no longer exists.', code: 'FORCE_LOGOUT' });
    }

    if (user.status === 'blocked') {
      res.clearCookie('token');
      return res.status(403).json({ error: 'This account has been blocked.', code: 'FORCE_LOGOUT' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware DB error:', err);
    return res.status(500).json({ error: 'Server error while checking your session.' });
  }
}

module.exports = { authMiddleware };
