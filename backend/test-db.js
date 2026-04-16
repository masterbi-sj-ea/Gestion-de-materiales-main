require('ts-node').register({ transpileOnly: true });
require('dotenv').config({ path: '.env' });
const sql = require('mssql');

async function main() {
  const config = {
    server: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_ENCRYPT !== 'true',
    }
  };

  const pool = await sql.connect(config);
  
  const result = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DetalleDespachos'
  `);
  console.dir(result.recordset);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
