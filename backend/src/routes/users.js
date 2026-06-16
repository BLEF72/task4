const express = require('express');
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, status, last_login, registration_time
       FROM users
       ORDER BY last_login DESC NULLS LAST, registration_time DESC`
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Fetch users error:', err);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

function parseIds(body) {
  if (!body || !Array.isArray(body.ids)) return null;
  const ids = body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return null;
  return ids;
}

router.post('/block', async (req, res) => {
  const ids = parseIds(req.body);
  if (!ids) return res.status(400).json({ error: 'Please select at least one user.' });

  try {
    await pool.query(`UPDATE users SET status = 'blocked' WHERE id = ANY($1::int[])`, [ids]);
    return res.json({ message: `Blocked ${ids.length} user(s).`, blockedSelf: ids.includes(req.user.id) });
  } catch (err) {
    console.error('Block users error:', err);
    return res.status(500).json({ error: 'Failed to block the selected user(s).' });
  }
});

router.post('/unblock', async (req, res) => {
  const ids = parseIds(req.body);
  if (!ids) return res.status(400).json({ error: 'Please select at least one user.' });

  try {
    await pool.query(`UPDATE users SET status = 'active' WHERE id = ANY($1::int[])`, [ids]);
    return res.json({ message: `Unblocked ${ids.length} user(s).` });
  } catch (err) {
    console.error('Unblock users error:', err);
    return res.status(500).json({ error: 'Failed to unblock the selected user(s).' });
  }
});
router.post('/delete', async (req, res) => {
  const ids = parseIds(req.body);
  if (!ids) return res.status(400).json({ error: 'Please select at least one user.' });

  try {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);
    return res.json({ message: `Deleted ${ids.length} user(s).`, deletedSelf: ids.includes(req.user.id) });
  } catch (err) {
    console.error('Delete users error:', err);
    return res.status(500).json({ error: 'Failed to delete the selected user(s).' });
  }
});
router.post('/delete-unverified', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM users WHERE status = 'unverified' RETURNING id`);
    return res.json({ message: `Deleted ${result.rowCount} unverified user(s).` });
  } catch (err) {
    console.error('Delete unverified users error:', err);
    return res.status(500).json({ error: 'Failed to delete unverified users.' });
  }
});

module.exports = router;
