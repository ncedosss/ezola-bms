const jwt = require('jsonwebtoken');

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Session expired' }); }
}

const requireRole = (roles) => (req, res, next) => {
  const list = Array.isArray(roles) ? roles : [roles];
  if (!list.includes(req.user.role)) return res.status(403).json({ error: 'Not permitted for your role' });
  next();
};

// Permission groups per design section 2.2
const MANAGERS = ['owner', 'office_manager', 'facility_manager'];
const ORDER_TAKERS = ['owner', 'office_manager', 'facility_manager', 'waiter', 'shop_attendant']; 
const PAYMENT_TAKERS = ['owner', 'office_manager', 'facility_manager', 'shop_attendant'];         
const RECEPTION_PLUS = ['owner', 'office_manager', 'facility_manager', 'reception'];
const KITCHEN_PLUS = ['owner', 'office_manager', 'facility_manager', 'kitchen'];
const RECON_USERS = ['owner', 'office_manager', 'facility_manager'];
const R65_CONFIRM_USERS = ['owner', 'office_manager', 'facility_manager', 'shop_attendant'];

module.exports = { sign, requireAuth, requireRole, MANAGERS, ORDER_TAKERS, PAYMENT_TAKERS, R65_CONFIRM_USERS, RECEPTION_PLUS, KITCHEN_PLUS, RECON_USERS };
