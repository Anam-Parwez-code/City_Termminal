// ============================================================
// FILE: backend/src/controllers/adminAuthController.js
// FIXED VERSION
// ============================================================
// FIX 1: DB error properly catch karke log karo
// FIX 2: Password comparison fixed
// FIX 3: Better error messages
// ============================================================

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'city-terminal-secret-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Fallback users — agar DB table nahi bani toh
const fallbackUsers = [
  { email: 'admin@cityterminal.ae', password: 'admin123', role: 'Admin', name: 'System Admin' },
  { email: 'manager@cityterminal.ae', password: 'manager123', role: 'Manager', name: 'Ops Manager' },
  { email: 'viewer@cityterminal.ae', password: 'viewer123', role: 'Viewer', name: 'Read Only User' },
];

const ensureAdminUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(30) DEFAULT 'Viewer',
      name VARCHAR(255) DEFAULT 'Admin User',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
};

// ── LOGIN ──────────────────────────────────────────────────
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required',
      });
    }

    let user = null;

    if (pool.isDbReachable && pool.isDbReachable()) {
      try {
        await ensureAdminUsersTable();
        const result = await pool.query(
          'SELECT email, password, role, name FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1',
          [email.trim()]
        );

        if (result.rows.length > 0) {
          const dbUser = result.rows[0];
          if (dbUser.password === password.trim()) {
            user = dbUser;
            console.log('✅ Login via DB:', user.email);
          } else {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials',
            });
          }
        }
      } catch (dbErr) {
        console.warn('DB login skipped:', dbErr.message);
      }
    }

    // DB mein nahi mila — fallback check karo
    if (!user) {
      user = fallbackUsers.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim() &&
             u.password === password.trim()
      );
      if (user) console.log('✅ Login via fallback:', user.email);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Check email and password.',
      });
    }

    // Token generate karo
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
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── SIGNUP ─────────────────────────────────────────────────
const signupAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required',
      });
    }

    let createdUser = null;

    // DB mein try karo
    try {
      await ensureAdminUsersTable();
      // Already exists?
      const existing = await pool.query(
        'SELECT email, password, role, name FROM admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email.trim()]
      );

      if (existing.rows.length > 0) {
        const dbUser = existing.rows[0];

        if (dbUser.password === password.trim()) {
          const token = jwt.sign(
            { email: dbUser.email, role: dbUser.role, name: dbUser.name },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
          );

          return res.status(200).json({
            success: true,
            token,
            user: { email: dbUser.email, role: dbUser.role, name: dbUser.name },
            message: 'Account already exists. Logged in instead.',
          });
        }

        return res.status(409).json({
          success: false,
          message: 'User already exists. Please login.',
        });
      }

      // Insert karo
      const inserted = await pool.query(
        `INSERT INTO admin_users (email, password, role, name)
         VALUES ($1, $2, $3, $4)
         RETURNING email, role, name`,
        [email.trim(), password.trim(), 'Viewer', name?.trim() || 'Admin User']
      );

      createdUser = inserted.rows[0];
      console.log('✅ Signup via DB:', createdUser.email);

    } catch (dbErr) {
      console.error('DB error in signup — using fallback:', dbErr.message);

      // Fallback — in-memory
      const existsFallback = fallbackUsers.find(
        u => u.email.toLowerCase() === email.toLowerCase().trim()
      );

      if (existsFallback) {
        if (existsFallback.password === password.trim()) {
          createdUser = { email: existsFallback.email, role: existsFallback.role, name: existsFallback.name };
        } else {
          return res.status(409).json({
          success: false,
          message: 'User already exists. Please login.',
          });
        }
      }

      if (!createdUser) {
      const newUser = {
        email: email.trim(),
        password: password.trim(),
        role: 'Viewer',
        name: name?.trim() || 'Admin User',
      };
      fallbackUsers.push(newUser);
      createdUser = { email: newUser.email, role: newUser.role, name: newUser.name };
      console.log('✅ Signup via fallback:', createdUser.email);
      }
    }

    // Token generate karo
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
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { loginAdmin, signupAdmin };
