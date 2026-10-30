const form = document.querySelector('#lookup-form');
const input = document.querySelector('#student-id');
const button = document.querySelector('#submit-button');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const empty = document.querySelector('#empty-state');
const fields = document.querySelector('#result-fields');
let pending = false;
function clearResults() { results.hidden = true; fields.replaceChildren(); empty.hidden = false; status.textContent = ''; status.className = ''; }
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
    for (const field of data.fields) {
      const row = document.createElement('div'); row.className = 'field';
      const label = document.createElement('dt'); label.textContent = field.label;
      const value = document.createElement('dd'); value.textContent = field.value === '' ? 'ยังไม่มีข้อมูล' : field.value;
      row.append(label, value); fields.append(row);
    }
    results.hidden = false; status.textContent = 'พบข้อมูลผลการเรียนของรหัสที่ค้นหา'; status.className = 'success';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'การเชื่อมต่อใช้เวลานาน กรุณาลองใหม่อีกครั้ง' : (error instanceof TypeError || error instanceof SyntaxError) ? 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่ภายหลัง' : error.message;
    status.className = 'error'; empty.hidden = false;
  } finally { pending = false; input.readOnly = false; button.disabled = false; button.innerHTML = 'ดูผลการเรียน <span aria-hidden="true">↗</span>'; }
});
