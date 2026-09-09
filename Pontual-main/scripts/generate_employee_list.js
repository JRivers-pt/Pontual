const fs = require('fs');
const path = require('path');

const sqlPath = 'C:\\Users\\JD\\Desktop\\cmb\\CP DBASE.sql';
const content = fs.readFileSync(sqlPath, 'utf8');

function extractTableData(tableName) {
  const createRegex = new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?\`?${tableName}\`?\\s*\\(([\\s\\S]*?)\\)\\s*(?:ENGINE|;)`, 'i');
  const createMatch = content.match(createRegex);
  if (!createMatch) return { colLines: [], rows: [] };
  
  const colLines = createMatch[1].split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('`'))
    .map(l => {
      const m = l.match(/^`(\w+)`/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  const insertRegex = new RegExp(`INSERT INTO \`${tableName}\`[\\s\\S]*?VALUES\\s*([\\s\\S]*?);`, 'gi');
  let insertMatch;
  const rows = [];
  while ((insertMatch = insertRegex.exec(content)) !== null) {
    const rawValues = insertMatch[1];
    let inParen = false;
    let inString = false;
    let escape = false;
    let currentTuple = '';
    
    for (let i = 0; i < rawValues.length; i++) {
      const ch = rawValues[i];
      if (escape) {
        currentTuple += ch;
        escape = false;
        continue;
      }
      if (ch === '\\') {
        currentTuple += ch;
        escape = true;
        continue;
      }
      if (ch === "'") {
        inString = !inString;
        currentTuple += ch;
        continue;
      }
      if (!inString) {
        if (ch === '(') {
          inParen = true;
          currentTuple = '';
          continue;
        }
        if (ch === ')') {
          inParen = false;
          rows.push(parseTuple(currentTuple, colLines));
          currentTuple = '';
          continue;
        }
      }
      if (inParen) {
        currentTuple += ch;
      }
    }
  }
  return { colLines, rows };
}

function parseTuple(str, cols) {
  const parts = [];
  let cur = '';
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      cur += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      cur += ch;
      escape = true;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (ch === ',' && !inString) {
      parts.push(cleanVal(cur));
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cleanVal(cur));
  
  const obj = {};
  cols.forEach((col, idx) => {
    obj[col] = parts[idx] !== undefined ? parts[idx] : null;
  });
  return obj;
}

function cleanVal(v) {
  v = v.trim();
  if (v.toUpperCase() === 'NULL') return null;
  return v;
}

// 1. Get all schedules
const taMap = {};
const { rows: schedules } = extractTableData('time_attendance');
schedules.forEach(s => {
  taMap[s.id_time_attendance] = s;
});

// 2. Get user_time_attendance_assoc (find the latest active assignment for each user)
const { rows: assocs } = extractTableData('user_time_attendance_assoc');
// Sort by modified ascending so later records overwrite
assocs.sort((a, b) => (a.modified || '').localeCompare(b.modified || ''));

const userScheduleMap = {};
assocs.forEach(a => {
  if (a.deleted === '0') {
    userScheduleMap[a.users_id_user] = taMap[a.time_attendance_id_time_attendance] || null;
  } else if (userScheduleMap[a.users_id_user] && userScheduleMap[a.users_id_user].id_time_attendance === a.time_attendance_id_time_attendance) {
    // If it was deleted, clear it unless replaced
    delete userScheduleMap[a.users_id_user];
  }
});

// 3. Get users
const { rows: users } = extractTableData('users');
const activeUsers = users.filter(u => u.deleted === '0');

console.log(`Total users in DB: ${users.length}, Active users (deleted=0): ${activeUsers.length}`);

const employeeList = activeUsers.map(u => {
  const sched = userScheduleMap[u.id_user];
  const fullName = `${u.user_name || ''} ${u.surname || ''}`.trim();
  return {
    id_user: u.id_user,
    reg_number: u.reg_number || u.id_user,
    name: fullName,
    card_number: u.card_number && u.card_number !== '0' ? u.card_number : '-',
    active: u.active === '1' ? 'Ativo' : 'Inativo',
    fingerprints: u.num_fingerprints || '0',
    schedule_code: sched ? (sched.time_attendance_description || sched.name) : 'Sem Horário Atribuído',
    schedule_name: sched ? sched.name : 'N/A'
  };
});

// Sort by reg_number or name
employeeList.sort((a, b) => {
  const numA = parseInt(a.reg_number, 10) || 999999;
  const numB = parseInt(b.reg_number, 10) || 999999;
  return numA - numB;
});

console.log('\n--- SAMPLE EMPLOYEES (First 15) ---');
console.table(employeeList.slice(0, 15));

// Export to CSV
const csvHeader = 'Nº Mecanográfico (ID);Nome Completo;Cartão / Tag RFID;Estado;Digitais Registadas;Código Horário;Descrição Completa do Horário\n';
const csvRows = employeeList.map(e => {
  const reg = e.reg_number || e.id_user;
  const name = `"${e.name.replace(/"/g, '""')}"`;
  const card = `"${(e.card_number || '-').replace(/"/g, '""')}"`;
  const active = `"${e.active}"`;
  const fps = `"${e.fingerprints}"`;
  const schedCode = `"${(e.schedule_code || '').replace(/"/g, '""')}"`;
  const schedName = `"${(e.schedule_name || '').replace(/"/g, '""')}"`;
  return `${reg};${name};${card};${active};${fps};${schedCode};${schedName}`;
}).join('\n');

const csvPath = 'C:\\Users\\JD\\Desktop\\cmb\\Lista_Colaboradores_CMB.csv';
fs.writeFileSync(csvPath, '\uFEFF' + csvHeader + csvRows, 'utf8');
console.log(`\nSuccessfully created CSV at: ${csvPath}`);

// Export to Excel (.xlsx)
try {
  const XLSX = require('xlsx');
  const excelData = employeeList.map(e => ({
    'Nº Mecanográfico (ID)': e.reg_number || e.id_user,
    'Nome Completo': e.name,
    'Cartão / RFID': e.card_number || '-',
    'Estado': e.active,
    'Digitais Registadas': Number(e.fingerprints) || 0,
    'Código Horário': e.schedule_code,
    'Descrição do Horário': e.schedule_name
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  worksheet['!cols'] = [
    { wch: 22 },
    { wch: 35 },
    { wch: 18 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
    { wch: 45 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Colaboradores CMB');
  const xlsxPath = 'C:\\Users\\JD\\Desktop\\cmb\\Lista_Colaboradores_CMB.xlsx';
  XLSX.writeFile(workbook, xlsxPath);
  console.log(`Successfully created Excel spreadsheet at: ${xlsxPath}`);
} catch (err) {
  console.error('Error generating Excel file:', err.message);
}

// Also create JSON for easy import into Pontual / Supabase if needed
const jsonPath = 'C:\\Users\\JD\\Desktop\\cmb\\colaboradores_cmb.json';
fs.writeFileSync(jsonPath, JSON.stringify(employeeList, null, 2), 'utf8');
console.log(`Successfully created JSON at: ${jsonPath}`);
