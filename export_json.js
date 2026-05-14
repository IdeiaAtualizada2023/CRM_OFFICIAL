const xlsx = require('xlsx');
const fs = require('fs');

const workbook = xlsx.readFile('e:/07_projetos/APLICACAO_PLANILHA/planilha_clientes_regis.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { defval: "" }); // keep empty values as empty strings
fs.writeFileSync('vendas_export.json', JSON.stringify(data, null, 2));

console.log(`Exported ${data.length} records to vendas_export.json`);
