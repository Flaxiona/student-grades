import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, lookup, handler, prepareRows } from '../netlify/functions/grades.mjs';

const sheet2CSV = () => {
  const top = ['RSU164sec12', '', 'trello', ...Array(28).fill('งาน'), 'เกรด'];
  const max = ['รหัสนักศึกษา', 'ชื่อ-นามสกุล', '6', ...Array(28).fill('2'), ''];
  const row = id => [id, id === '0001' ? 'หนึ่ง' : 'สอง', '5', ...Array(28).fill('1'), 'A'];
  return [top, max, row('0001'), row('0002')].map(r => r.join(',')).join('\n');
};
test('Sheet2 joins assignment titles and maxima and preserves the actual grade', () => {
  const rows = prepareRows(parseCSV(sheet2CSV()));
  const record = lookup(rows, '0001');
  assert.equal(record.fields.length, 32);
  assert.equal(record.fields[31].value, 'A');
  assert.equal(record.fields[2].label, 'trello (เต็ม 6)');
  assert.throws(() => prepareRows([['Other sheet']]), /HEADER_NOT_FOUND/);
});

test('CSV preserves quoted commas, newlines, quotes and leading zeroes', () => {
  assert.deepEqual(parseCSV('\uFEFFรหัสนักศึกษา,ชื่อ,หมายเหตุ\r\n001234,"ก, ข","บรรทัดแรก\nบรรทัดสอง ""ดี"""'), [['รหัสนักศึกษา', 'ชื่อ', 'หมายเหตุ'], ['001234', 'ก, ข', 'บรรทัดแรก\nบรรทัดสอง "ดี"']]);
});
test('lookup detects header after title and returns only the exact student', () => {
  const rows = [['ผลการเรียน'], ['รหัสประจำตัวนักศึกษา', 'ชื่อ', 'คะแนน'], ['001234', 'หนึ่ง', '80'], ['1234', 'สอง', '60']];
  assert.equal(lookup(rows, '001234').fields[1].value, 'หนึ่ง');
  assert.equal(lookup(rows, '1234').fields[1].value, 'สอง');
  assert.equal(lookup(rows, '0012'), null);
});
test('duplicate student IDs and absent headers fail closed', () => {
  assert.throws(() => lookup([['ชื่อ'], ['หนึ่ง']], '1234'), /HEADER_NOT_FOUND/);
  assert.throws(() => lookup([['Student ID'], ['1234'], ['1234']], '1234'), /DUPLICATE_ID/);
});
test('configuration supports custom header and hides selected columns', () => {
  const record = lookup([['ID', 'ชื่อ', 'ข้อมูลภายใน'], ['0001', 'หนึ่ง', 'ลับ']], '0001', { headerRow: '1', idColumn: 'ID', hiddenColumns: 'ข้อมูลภายใน' });
  assert.equal(record.fields.length, 2);
});
test('HTTP API fetches CSV server-side and exposes only one matching row', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url.searchParams.get('gid'), '1858159452');
    return new Response(sheet2CSV());
  };
  try {
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ studentId: '0001' }) });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Cache-Control'], /no-store/);
    assert.ok(!res.body.includes('สอง'));
    assert.equal((await handler({ httpMethod: 'POST', body: '{"studentId":"9999"}' })).statusCode, 404);
  } finally { globalThis.fetch = original; }
});
test('API rejects invalid input and handles private-sheet HTML', async () => {
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.equal((await handler({ httpMethod: 'POST', body: '{' })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: '{"studentId":"<script>"}' })).statusCode, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>Sign in</html>');
  try { assert.equal((await handler({ httpMethod: 'POST', body: '{"studentId":"0001"}' })).statusCode, 503); }
  finally { globalThis.fetch = original; }
});
