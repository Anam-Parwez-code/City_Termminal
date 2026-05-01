const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'db.pioaxatgbnkxlodjtyhk.supabase.co',
  database: 'postgres',
  password: '-tsnL5xqa-/UJSC', // Aapka asli password
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

// Ye check karne ke liye ki file load hui
console.log("--- DB.js file initialize ho chuki hai ---");

module.exports = pool;