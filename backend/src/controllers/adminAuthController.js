const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const fallbackUsers = [
  { email: 'admin@cityterminal.ae', password: 'admin123', role: 'Admin', name: 'System Admin' },
  { email: 'manager@cityterminal.ae', password: 'manager123', role: 'Manager', name: 'Ops Manager' },
  { email: 'viewer@cityterminal.ae', password: 'viewer123', role: 'Viewer', name: 'Read Only User' },
];

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    let user = null;
    try {
      const dbUser = await pool.query(
        'SELECT email, password, role, name FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1',
        [email]
      );
      if (dbUser.rows[0] && dbUser.rows[0].password === password) {
        user = dbUser.rows[0];
      }
    } catch (_err) {
      // Fallback to env/demo users if table does not exist yet.
    }

    if (!user) {
      user = fallbackUsers.find(
        (u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
      );
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const signupAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    let createdUser = null;
    try {
      const existing = await pool.query(
        'SELECT email FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1',
        [email]
      );
      if (existing.rows[0]) {
        return res.status(409).json({ success: false, message: 'User already exists' });
      }
      const inserted = await pool.query(
        `INSERT INTO admin_users (email, password, role, name)
         VALUES ($1, $2, $3, $4)
         RETURNING email, role, name`,
        [email, password, 'Viewer', name || 'Admin User']
      );
      createdUser = inserted.rows[0];
    } catch (_err) {
      // Fallback to in-memory signup if DB table is unavailable.
      const existsFallback = fallbackUsers.some((u) => u.email.toLowerCase() === String(email).toLowerCase());
      if (existsFallback) {
        return res.status(409).json({ success: false, message: 'User already exists' });
      }
      const inMemoryUser = {
        email,
        password,
        role: 'Viewer',
        name: name || 'Admin User',
      };
      fallbackUsers.push(inMemoryUser);
      createdUser = { email: inMemoryUser.email, role: inMemoryUser.role, name: inMemoryUser.name };
    }

    const token = jwt.sign(
      { email: createdUser.email, role: createdUser.role, name: createdUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      token,
      user: createdUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { loginAdmin, signupAdmin };

