const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { sign, requireAuth } = require('../middleware/auth');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true });

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 12 * 3600 * 1000,
};

// S01 - email + password (web)
router.post('/login', limiter, async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 AND active=TRUE', [email || '']);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.cookie('token', sign(user), cookieOpts);
  res.json({ id: user.id, name: user.name, role: user.role });
});

// S01 - fast PIN user-switch on the shared till tablet (maps every till action to a real user)
router.post('/pin', limiter, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const { rows } = await pool.query('SELECT * FROM users WHERE active=TRUE AND pin_hash IS NOT NULL');
  const user = rows.find((u) => bcrypt.compareSync(pin, u.pin_hash));
  if (!user) return res.status(401).json({ error: 'Unknown PIN' });
  res.cookie('token', sign(user), cookieOpts);
  res.json({ id: user.id, name: user.name, role: user.role });
});

router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });

router.get('/me', requireAuth, (req, res) => res.json(req.user));

module.exports = router;
