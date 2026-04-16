const sql = require('mssql');
const { dbConfig } = require('./src/services/dbConfig');

async function main() {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DetalleDespachos'");
    console.dir(result.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
main();
