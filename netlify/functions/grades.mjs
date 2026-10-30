const DEFAULT_SHEET = '1oeiFOsfa5214h_p7Rac3_EYqJjXD1D4EsGekJTJCyik';
const SHEET2_GID = '1858159452';

export function parseCSV(input) {
  const rows = []; let row = [], cell = '', quoted = false;
  const source = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('INVALID_CSV');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const normalized = value => String(value ?? '').normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase();
const idHeaders = new Set(['รหัสนักศึกษา', 'รหัสประจำตัวนักศึกษา', 'รหัสนศ.', 'รหัสนศ', 'studentid', 'student_id', 'studentnumber'].map(normalized));

// Sheet2 has assignment titles in row 1 and identity headers / maxima in row 2.
export function prepareRows(rows) {
  if (rows[0]?.[0]?.trim() !== 'RSU164sec12' || normalized(rows[1]?.[0]) !== normalized('รหัสนักศึกษา') || rows[0]?.[31]?.trim() !== 'เกรด') throw new Error('HEADER_NOT_FOUND');
  const headers = rows[0].map((title, i) => {
    if (i < 2) return rows[1][i].trim();
    const max = rows[1][i]?.trim();
    return `${title.trim() || `ข้อมูลช่องที่ ${i + 1}`}${max ? ` (เต็ม ${max})` : ''}`;
  });
  return [headers, ...rows.slice(2)];
}

export function lookup(rows, id, options = {}) {
  let headerIndex = options.headerRow ? Number(options.headerRow) - 1 : rows.findIndex(r => r.some(c => idHeaders.has(normalized(c))));
  if (!Number.isInteger(headerIndex) || headerIndex < 0 || !rows[headerIndex]) throw new Error('HEADER_NOT_FOUND');
  const headers = rows[headerIndex];
  const idIndex = options.idColumn ? headers.findIndex(h => normalized(h) === normalized(options.idColumn)) : headers.findIndex(h => idHeaders.has(normalized(h)));
  if (idIndex < 0) throw new Error('HEADER_NOT_FOUND');
  const matches = rows.slice(headerIndex + 1).filter(r => normalized(r[idIndex]) === normalized(id));
  if (matches.length > 1) throw new Error('DUPLICATE_ID');
  if (!matches.length) return null;
  const hidden = new Set(String(options.hiddenColumns || '').split('|').filter(Boolean).map(normalized));
  const fields = headers.map((label, i) => ({ label: label.trim() || `ข้อมูลช่องที่ ${i + 1}`, value: matches[0][i] ?? '' }))
    .filter((field, i) => !hidden.has(normalized(headers[i])));
  return { fields };
}

export const handler = async event => {
  const response = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(data) });
  if (event.httpMethod !== 'POST') return response(405, { message: 'กรุณาค้นหาผ่านหน้าเว็บไซต์' });
  let id;
  try { id = JSON.parse(event.body || '{}').studentId; } catch { return response(400, { message: 'คำขอไม่ถูกต้อง' }); }
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{4,30}$/.test(id.trim())) return response(400, { message: 'กรุณากรอกรหัสนักศึกษา 4–30 ตัว ใช้ตัวเลข ตัวอักษร หรือขีดกลาง' });
  const url = new URL(`https://docs.google.com/spreadsheets/d/${DEFAULT_SHEET}/export`);
  url.searchParams.set('format', 'csv'); url.searchParams.set('gid', SHEET2_GID);
  try {
    const result = await fetch(url, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const csv = await result.text();
    if (!result.ok || /<!doctype|<html/i.test(csv)) throw new Error('SHEET_UNAVAILABLE');
    const rows = prepareRows(parseCSV(csv));
    const record = lookup(rows, id.trim(), { hiddenColumns: process.env.HIDDEN_COLUMNS });
    if (!record) return response(404, { message: 'ไม่พบรหัสนักศึกษานี้ กรุณาตรวจสอบรหัสแล้วลองอีกครั้ง' });
    return response(200, record);
  } catch (error) {
    const config = ['HEADER_NOT_FOUND', 'DUPLICATE_ID'].includes(error.message);
    return response(503, { message: config ? 'ข้อมูลในชีตยังไม่พร้อมแสดง กรุณาติดต่ออาจารย์ผู้สอน' : 'ยังเชื่อมต่อ Google Sheet ไม่ได้ กรุณาลองใหม่ภายหลัง หรือติดต่ออาจารย์ผู้สอน' });
  }
};
