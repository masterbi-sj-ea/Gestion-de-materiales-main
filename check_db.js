const sql = require('mssql');
const config = require('./backend/src/services/dbConfig');

async function check() {
  try {
    const pool = await sql.connect(config.dbConfig || config.development || config);
    const res = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DetalleDespachos'");
    console.log("DetalleDespachos:", res.recordset);
    
    const res2 = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Despachos'");
    console.log("Despachos:", res2.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
check();
