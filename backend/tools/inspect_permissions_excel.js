const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function normalizeArgs() {
  const inputArg = process.argv[2] || 'imports/permisos.xlsx';
  const absolutePath = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(process.cwd(), inputArg);

  return { inputArg, absolutePath };
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`);
  }

  return XLSX.readFile(filePath, { cellDates: false });
}

function getSheetSummary(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  const firstRow = rows[0] || {};
  const headers = Object.keys(firstRow);

  return {
    sheetName,
    rowCount: rows.length,
    headers,
    sampleRows: rows.slice(0, 5),
  };
}

function main() {
  const { absolutePath } = normalizeArgs();
  const workbook = readWorkbook(absolutePath);
  const summary = workbook.SheetNames.map((sheetName) => getSheetSummary(workbook, sheetName));

  const output = {
    file: absolutePath,
    sheets: summary,
  };

  console.log(JSON.stringify(output, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}