import { getPool } from './backend/src/config/db';

async function main() {
  const pool = await getPool();
  console.log("Connected to DB!");
  
  const result = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN (
        'AreaRecursoCuenta', 'MaterialRecurso', 'Recursos', 'Materiales', 'MaterialCatalogo', 'CatalogoMateriales', 'MaterialesCatalogos', 'MaterialCatalogos'
      )
  `);
  
  console.log("Columns found:", result.recordset.length);
  const map = new Map();
  for (const r of result.recordset) {
    if (!map.has(r.TABLE_NAME)) map.set(r.TABLE_NAME, []);
    map.get(r.TABLE_NAME).push(r.COLUMN_NAME);
  }
  
  for (const [table, cols] of map.entries()) {
    console.log(`Table ${table}: ${cols.join(', ')}`);
  }
  
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
