const fs = require('fs');

const sqlPath = 'C:\\Users\\JD\\Desktop\\cmb\\CP DBASE.sql';
const content = fs.readFileSync(sqlPath, 'utf8');

function extractTableData(tableName) {
  // Find CREATE TABLE to get column names
  const createRegex = new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?\`?${tableName}\`?\\s*\\(([\\s\\S]*?)\\)\\s*(?:ENGINE|;)`, 'i');
  const createMatch = content.match(createRegex);
  if (!createMatch) {
    console.log(`Table ${tableName} not found`);
    return [];
  }
  
  const colLines = createMatch[1].split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('`'))
    .map(l => {
      const m = l.match(/^`(\w+)`/);
      return m ? m[1] : null;
    })
    .filter(Boolean);

  console.log(`Columns for ${tableName}:`, colLines);

  // Find INSERT INTO `tableName`
  const insertRegex = new RegExp(`INSERT INTO \`${tableName}\`[\\s\\S]*?VALUES\\s*([\\s\\S]*?);`, 'gi');
  let insertMatch;
  const rows = [];
  while ((insertMatch = insertRegex.exec(content)) !== null) {
    // Parse value tuples
    const rawValues = insertMatch[1];
    // Simple regex or scanner for (...)
    // Let's do a character scanner to handle escaped quotes correctly
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

console.log('--- USERS ---');
const usersData = extractTableData('users');
console.log(`Total users found: ${usersData.rows.length}`);
if (usersData.rows.length > 0) {
  console.log('Sample user:', usersData.rows[0]);
}

console.log('\n--- TIME ATTENDANCE ---');
const taData = extractTableData('time_attendance');
console.log(`Total time_attendance schedules: ${taData.rows.length}`);
taData.rows.forEach(r => console.log(r));

console.log('\n--- USER TIME ATTENDANCE ASSOC ---');
const userTaAssoc = extractTableData('user_time_attendance_assoc');
console.log(`Total user_ta_assoc: ${userTaAssoc.rows.length}`);
if (userTaAssoc.rows.length > 0) {
  console.log('Sample user_ta_assoc:', userTaAssoc.rows[0]);
}

console.log('\n--- USER GROUPS ---');
const ugData = extractTableData('user_groups');
console.log(`Total user_groups: ${ugData.rows.length}`);
ugData.rows.forEach(r => console.log(r));

