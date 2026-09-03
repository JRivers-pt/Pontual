import XLSX from 'xlsx';
import fs from 'fs';

const EXCEL_PATH = 'C:\\Users\\JD\\Desktop\\Horários Colégio Manuel Bernardes.xlsx';
const OUT_PATH = 'C:\\Users\\JD\\Downloads\\cmb_colaboradores_por_horario.csv';

interface ColabRow {
  Código: number;
  Nome: string;
  Apelido: string;
  'Manhã'?: string;
  'Tarde'?: string;
  Horário: string;
}

interface HorarioRow {
  Horarios: string;
  Entrada: number;
  'Saída\r\nAlmoço': number;
  'Regresso Almoço': number;
  Saída: number;
}

function excelTimeToHHMM(serial: number): string {
  const totalMinutes = Math.round(serial * 24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const wb = XLSX.readFile(EXCEL_PATH);
const colabSheet = wb.Sheets['Colaboradores'];
const horarioSheet = wb.Sheets['Horários'];

const colaboradores = XLSX.utils.sheet_to_json<ColabRow>(colabSheet);
const horarios = XLSX.utils.sheet_to_json<HorarioRow>(horarioSheet);

const horarioMeta = new Map<string, string>();
for (const h of horarios) {
  const id = String(h.Horarios).trim();
  const entrada = excelTimeToHHMM(h.Entrada);
  const saida = excelTimeToHHMM(h.Saída);
  horarioMeta.set(id, `${entrada}-${saida}`);
}

const rows: string[] = [];
rows.push('workno;Nome;Horario;Horas(Entrada-Saida)');

const byHorario = new Map<string, string[]>();
for (const c of colaboradores) {
  const workno = String(c.Código);
  const nome = [c.Nome, c.Apelido].filter(Boolean).join(' ').trim();
  const horId = String(c.Horário).trim();
  const meta = horarioMeta.get(horId) || '';
  rows.push(`${workno};${nome};${horId};${meta}`);
  if (!byHorario.has(horId)) byHorario.set(horId, []);
  byHorario.get(horId)!.push(`${workno} - ${nome}`);
}

const lines = [rows.join('\n'), '', '=== RESUMO POR HORÁRIO ==='];
for (const [horId, list] of [...byHorario.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
  lines.push('');
  lines.push(`${horId} (${horarioMeta.get(horId)}) - ${list.length} colaboradores:`);
  list.forEach(n => lines.push(`   ${n}`));
}

fs.writeFileSync(OUT_PATH, '\uFEFF' + lines.join('\n'), 'utf8');
console.log('Gerado:', OUT_PATH);
console.log(`Total colaboradores: ${colaboradores.length}`);
console.log(`Horários distintos: ${byHorario.size}`);
