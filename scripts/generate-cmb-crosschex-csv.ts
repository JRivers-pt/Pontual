import XLSX from 'xlsx';
import fs from 'fs';

const EXCEL_PATH = 'C:\\Users\\JD\\Desktop\\Horários Colégio Manuel Bernardes.xlsx';
const OUTPUT_PATH = 'C:\\Users\\JD\\Downloads\\cmb_employees_crosschex.csv';

interface ExcelRow {
  Código: number;
  Nome: string;
  Apelido: string;
  'Manhã': string;
  'Tarde': string;
  Horário: string;
}

function main() {
  console.log('=== Gerar CSV importação CrossChex para CMB ===\n');

  console.log('📖 A ler o Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);
  const colabSheet = wb.Sheets['Colaboradores'];
  if (!colabSheet) {
    console.error('❌ Folha "Colaboradores" não encontrada');
    process.exit(1);
  }

  const colaboradores = XLSX.utils.sheet_to_json<ExcelRow>(colabSheet);
  console.log(`   ${colaboradores.length} colaboradores\n`);

  // Build lines
  const header = 'First Name,Last Name,Employee No.,Department,Position,Hire Date,Email,Tel,Password of attendance,Card ID,Field1,Field2';

  const lines = colaboradores.map(c => {
    const fullName = `${c.Nome}`.trim();
    const apelido = `${c.Apelido}`.trim();
    const employeeNo = String(c.Código);
    const firstName = fullName;
    // CrossChex CSV format: First Name, Last Name
    // Use the "Nome" as First Name and "Apelido" as Last Name
    return `"${firstName}","${apelido}",${employeeNo},Colégio,,,,,,,,`;
  });

  const csvContent = [header, ...lines].join('\r\n');
  // Add UTF-8 BOM so Excel/CrossChex detect the encoding correctly
  const bom = '\uFEFF';
  fs.writeFileSync(OUTPUT_PATH, bom + csvContent, 'utf8');

  console.log(`✅ Ficheiro criado: ${OUTPUT_PATH}`);
  console.log(`   ${colaboradores.length} colaboradores`);
  console.log('\nFormato do CSV:');
  console.log(header);
  lines.slice(0, 5).forEach(l => console.log(l));
}

main();
