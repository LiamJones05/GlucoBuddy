require('dotenv').config();
const sql = require('mssql');

const requiredEnvVars = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_SERVER',
  'DB_DATABASE',
  'DB_PORT',
];

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing database configuration in .env: ${missingEnvVars.join(', ')}`);
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: Number.parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

poolConnect.catch((error) => {
  console.error('Database connection failed:', error);
});

module.exports = {
  sql,
  pool,
  poolConnect,
};
