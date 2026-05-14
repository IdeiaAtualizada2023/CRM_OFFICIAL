const xlsx = require('xlsx');
const workbook = xlsx.readFile('e:/07_projetos/APLICACAO_PLANILHA/planilha_clientes_regis.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
console.log(JSON.stringify(xlsx.utils.sheet_to_json(sheet).slice(0, 5), null, 2));
console.log("\nCOLUMNS:");
console.log(JSON.stringify(xlsx.utils.sheet_to_json(sheet, {header: 1})[0], null, 2));
