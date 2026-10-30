const form = document.querySelector('#lookup-form');
const input = document.querySelector('#student-id');
const button = document.querySelector('#submit-button');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const empty = document.querySelector('#empty-state');
const fields = document.querySelector('#result-fields');
const details = document.querySelector('#student-details');
const summary = document.querySelector('#summary-fields');
let pending = false;
function clearResults() { results.hidden = true; fields.replaceChildren(); details.replaceChildren(); summary.replaceChildren(); empty.hidden = false; status.textContent = ''; status.className = ''; }
function renderFields(items) {
  for (const field of items) {
    const match = field.label.match(/^(.*?)\s*\(เต็ม\s+([^)]*)\)$/);
    const title = match ? match[1].trim() : field.label;
    const max = match?.[2];
    const row = document.createElement('div'); row.className = 'field';
    const label = document.createElement('dt'); label.textContent = title;
    const value = document.createElement('dd');
    const blank = field.value === '';
    const identity = /^(รหัสนักศึกษา|รหัสประจำตัวนักศึกษา|ชื่อ[-–]นามสกุล)$/.test(title);
    const total = title === 'คะแนนรวม'; const grade = title === 'เกรด';
    value.textContent = blank ? (max && !identity && !total ? `—/${max}` : 'ยังไม่มีข้อมูล') : `${field.value}${max && !identity && !total ? `/${max}` : ''}`;
    if (blank) row.classList.add('unrecorded');
    if (identity) { row.classList.add('identity'); details.append(row); }
    else if (total || grade) {
      row.classList.add(total ? 'total' : 'final-grade');
      if(total) label.textContent = 'คะแนนรวมปัจจุบัน';
      summary.append(row);
    } else fields.append(row);
    row.append(label, value);
  }
}
input.addEventListener('input', clearResults);
document.querySelector('#clear-button').addEventListener('click', () => { clearResults(); input.value = ''; input.focus(); });
window.addEventListener('pageshow', clearResults);
form.addEventListener('submit', async event => {
  event.preventDefault(); if (pending) return;
  clearResults(); pending = true; input.readOnly = true; button.disabled = true;
  button.textContent = 'กำลังค้นหา…'; status.textContent = 'กำลังเชื่อมต่อข้อมูลผลการเรียน…'; empty.hidden = true;
  try {
    const response = await fetch('/.netlify/functions/grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: input.value.trim() }), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถค้นหาข้อมูลได้');
    if (!Array.isArray(data.fields)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง กรุณาติดต่ออาจารย์');
    renderFields(data.fields);
    results.hidden = false; status.textContent = 'พบข้อมูลผลการเรียนของรหัสที่ค้นหา'; status.className = 'success';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'การเชื่อมต่อใช้เวลานาน กรุณาลองใหม่อีกครั้ง' : (error instanceof TypeError || error instanceof SyntaxError) ? 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่ภายหลัง' : error.message;
    status.className = 'error'; empty.hidden = false;
  } finally { pending = false; input.readOnly = false; button.disabled = false; button.innerHTML = 'ดูผลการเรียน <span aria-hidden="true">↗</span>'; }
});
