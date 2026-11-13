/* ================= CONFIG – edit these ================= */
// PayFast "Pay Now" checkout (same PayFast merchant account as DomestiSure / iNRECO).
// Uses PayFast's Pay Now button fields (cmd=_paynow + receiver), so NO merchant key,
// passphrase or signature is needed in this public page. Never put a key or passphrase here.
const PAYFAST = {
  enabled: true,                    // false = Pay buttons fall back to "WhatsApp us for a link"
  mode: 'live',                     // 'live' or 'sandbox' (sandbox = PayFast test account, no real money)
  receiver: '12090292',             // iNRECO PayFast merchant ID (public, shown on every PayFast payment)
  sandboxReceiver: '10000100',      // PayFast's public sandbox test merchant
  // The page's public address once hosted. Return/cancel pages are anchors on it.
  siteUrl: 'https://ccmaprep.inreco.co.za/',
  notifyUrl: ''                     // leave empty: no server yet. PayFast still emails you each payment.
};
// Optional: a PayFast dashboard payment link per package. If set, the button opens it instead of the form.
const PAYFAST_LINKS = {
  basic: 'PASTE_PAYFAST_LINK_R1200',
  response: 'PASTE_PAYFAST_LINK_R2500',
  relief: 'PASTE_PAYFAST_LINK_R4500'
};
const CONTACT = {
  whatsapp: '27844027029',          // wa.me format, no + or spaces
  whatsappDisplay: '084 402 7029',
  email: 'info@inreco.co.za'
};
const GROUP_DISCOUNT = { minSites: 3, percent: 15 };
const WA_MAX_CHARS = 3500;          // keep wa.me links a safe length
/* ======================================================== */

const PACKAGES = {
  basic:    { name: 'Inspection Readiness Pack', price: 1200, payName: 'iNRECO Inspection Readiness Pack' },
  response: { name: 'Inspection Response', price: 2500, payName: 'iNRECO Inspection Response Package' },
  relief:   { name: 'Full Relief Package', price: 4500, payName: 'iNRECO Full Relief Package' }
};

const DOCS = [
  ['doc_contracts', 'Employment contracts'],
  ['doc_payslips', 'Payslips (last 3 months)'],
  ['doc_time', 'Time records / clock cards'],
  ['doc_leave', 'Leave records'],
  ['doc_wage_register', 'Wage register / payroll report'],
  ['doc_policies', 'Workplace policies (e.g. disciplinary code)'],
  ['doc_posters', 'Display posters (BCEA, EE, OHS)'],
  ['doc_registrations', 'UIF / COIDA / SARS registration letters']
];

// Question lists for the pre-filled WhatsApp / email messages
const QUESTIONS = {
  basic: [
    'Business name (registered):', 'Trading name:', 'Company registration no.:', 'Contact person:',
    'WhatsApp number:', 'Email:',
    'Industry (retail / restaurant / franchise / construction / manufacturing / farming / security / cleaning / domestic / other):',
    'Bargaining council or sectoral determination? (yes / no / not sure - which one):',
    'Sunday, public holiday or night work? (yes / no):',
    'Number of employees:', 'Number of stores / sites:',
    'UIF reference no.:', 'COIDA / Compensation Fund no.:', 'SARS PAYE / SDL no.:',
    'Designated employer for Employment Equity? (yes / no / not sure):',
    'Health & safety reps? (yes / no):', 'First aiders? (yes / no):', 'Machinery used (which?):',
    'Documents I have (contracts, payslips, time records, leave records, wage register, policies, posters, registration letters):',
    'Anything special about your industry (e.g. PSiRA no., farm housing, CIDB grade):'
  ],
  responseExtra: [
    'Date of inspection:', "Inspector's name and labour office:",
    'What did you receive? (compliance order / contravention notice / undertaking):',
    'Date received:', 'Deadline written in the order:',
    'Amount claimed as fines (R):', 'Amount claimed as back pay (R):',
    'Number of employees affected:', 'What happened? (was it an oversight?):'
  ],
  reliefExtra: [
    'Have you paid anything yet? (not paid / partly / fully):',
    "Can you pay the workers' back pay now? (yes / no / some):",
    'Prefer to pay in instalments? (yes / no):',
    'First time at the CCMA? (yes / no):'
  ]
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const rand = n => 'R' + Math.round(n).toLocaleString('en-ZA').replace(/\u00a0|\s/g, ',');
const isSet = url => url && !/^PASTE_/.test(url);
const form = $('#packForm');
// One reference per visit; goes on the PayFast payment and in the WhatsApp/email answers so you can match them.
const ORDER_REF = (() => {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 5).toUpperCase();
  return `INS-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rnd}`;
})();
let current = 'basic';

/* ---------- Build document checklist ---------- */
$('#docList').innerHTML = DOCS.map(([id, label]) => `
  <div class="doc">
    <label class="top"><input type="checkbox" name="${id}" value="Yes" data-label="Have: ${label}"> ${label}</label>
    <input type="file" name="${id}_file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" aria-label="Upload ${label}">
  </div>`).join('');
// Ticking happens automatically when a file is chosen
$$('#docList .doc').forEach(d => {
  const cb = $('input[type=checkbox]', d), f = $('input[type=file]', d);
  f.addEventListener('change', () => { if (f.files.length) cb.checked = true; });
});

/* ---------- Sector conditional fields ---------- */
const sector = $('#f_sector');
function updateSector() {
  const v = sector.value;
  $('#condCommon').hidden = !v || v === 'domestic';
  $$('.cond[data-sector]').forEach(c => c.hidden = c.dataset.sector !== v);
}
sector.addEventListener('change', updateSector);
form.addEventListener('change', e => {
  if (e.target.name === 'bc_applies') $('#bcWhichWrap').hidden = e.target.value !== 'Yes';
  if (e.target.name === 'ohs_machinery') $('#machWrap').hidden = e.target.value !== 'Yes';
});

/* ---------- Sites & group discount ---------- */
const sitesEl = $('#f_sites');
function sites() { return Math.max(1, parseInt(sitesEl.value, 10) || 1); }
function isGroup() { return sites() >= GROUP_DISCOUNT.minSites; }
sitesEl.addEventListener('input', () => { $('#groupNote').hidden = !isGroup(); updateSummary(); });

/* ---------- Upgrade cards ---------- */
$$('.up-toggle').forEach(btn => btn.addEventListener('click', () => {
  const card = btn.closest('.up'), body = $('.up-body', card), open = body.hidden;
  body.hidden = !open; card.classList.toggle('open', open); btn.setAttribute('aria-expanded', open);
}));
$$('.choose-btn').forEach(b => b.addEventListener('click', () => selectPackage(b.dataset.pkg, true)));
$('#backToBasic').addEventListener('click', () => selectPackage('basic', false));

function selectPackage(pkg, scroll) {
  current = pkg;
  $('#packageInput').value = pkg;
  $$('.up').forEach(c => c.classList.toggle('selected', c.dataset.pkg === pkg));
  $$('.choose-btn').forEach(b => {
    const on = b.dataset.pkg === pkg;
    b.textContent = on ? '✓ Chosen – fill in the extra questions below' : 'Choose this package';
  });
  $('#extraResponse').hidden = pkg === 'basic';
  $('#extraRelief').hidden = pkg !== 'relief';
  $('#basicSwitch').hidden = pkg === 'basic';
  $('#start .tag').textContent = pkg === 'basic' ? 'Basic · selected' : 'Included in your package';
  updateSummary();
  if (scroll && pkg !== 'basic') $('#extraResponse').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Deadline countdown ---------- */
$('#f_deadline').addEventListener('change', e => {
  const el = $('#daysLeft');
  if (!e.target.value) { el.hidden = true; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(e.target.value + 'T00:00:00') - today) / 864e5);
  el.hidden = false;
  el.textContent = days < 0 ? `⚠ The deadline has passed (${-days} day${days === -1 ? '' : 's'} ago). WhatsApp us right now.`
    : days === 0 ? '⚠ The deadline is TODAY. WhatsApp us right now.'
    : `${days} day${days === 1 ? '' : 's'} left. Send us the order today.`;
});

/* ---------- Order summary + PayFast ---------- */
function totals() {
  const p = PACKAGES[current], n = sites();
  if (!isGroup()) return { each: p.price, n: 1, total: p.price, discount: 0 };
  const each = p.price * (1 - GROUP_DISCOUNT.percent / 100);
  return { each, n, total: each * n, discount: p.price * n - each * n };
}
function updateSummary() {
  const p = PACKAGES[current], t = totals();
  $('#sumName').textContent = p.name;
  $('#sumPrice').textContent = rand(p.price) + (t.n > 1 ? ' per store' : '');
  $('#sumGroupRow').hidden = !isGroup();
  $('#sumGroup').textContent = isGroup() ? `${GROUP_DISCOUNT.percent}% off × ${t.n} stores (save ${rand(t.discount)})` : '';
  $('#sumTotal').textContent = rand(t.total);
  $('#groupPayNote').hidden = !isGroup();
  $('#stickyName').textContent = p.name;
  $('#stickyPrice').textContent = rand(t.total);
  renderPay();
}
function payTotal(k) {
  // The chosen package pays its total (incl. group discount); the others pay their list price.
  return k === current ? totals().total : PACKAGES[k].price;
}
function renderPay() {
  $('#payList').innerHTML = Object.entries(PACKAGES).map(([k, p]) => {
    const on = k === current;
    return `<a class="btn paybtn ${on ? 'btn-primary' : 'dim'}" data-pay="${k}" href="#summary" rel="noopener">
      <span>${on ? 'Pay now: ' : ''}${p.name}${on && totals().n > 1 ? ` (${totals().n} stores)` : ''}</span><span class="amt">${rand(payTotal(k))}</span></a>`;
  }).join('');
}

/* PayFast Pay Now form fields for one package. Exposed for tests as window.payfastFields. */
function payfastFields(k) {
  const p = PACKAGES[k], live = PAYFAST.mode !== 'sandbox';
  const t = k === current ? totals() : { n: 1 };
  const biz = ($('#f_bizname').value || '').trim().slice(0, 80);
  const desc = [`Ref ${ORDER_REF}`, biz, t.n > 1 ? `${t.n} stores, ${GROUP_DISCOUNT.percent}% group discount` : '']
    .filter(Boolean).join(' | ').slice(0, 255);
  const base = PAYFAST.siteUrl.replace(/#.*$/, '');
  const f = {
    cmd: '_paynow',
    receiver: live ? PAYFAST.receiver : PAYFAST.sandboxReceiver,
    return_url: `${base}#paid`,
    cancel_url: `${base}#cancelled`,
    notify_url: PAYFAST.notifyUrl,
    name_first: ($('#f_contact').value || '').trim().split(/\s+/)[0].slice(0, 100),
    email_address: $('#f_email').checkValidity() ? ($('#f_email').value || '').trim() : '',
    m_payment_id: ORDER_REF,
    amount: payTotal(k).toFixed(2),
    item_name: p.payName,
    item_description: desc
  };
  Object.keys(f).forEach(key => { if (!f[key]) delete f[key]; });
  return { action: live ? 'https://www.payfast.co.za/eng/process' : 'https://sandbox.payfast.co.za/eng/process', fields: f };
}
window.payfastFields = payfastFields;

function goToPayfast(k) {
  const { action, fields } = payfastFields(k);
  try { localStorage.setItem('inreco_last_payment', JSON.stringify({ ref: ORDER_REF, pkg: PACKAGES[k].name, amount: fields.amount, at: Date.now() })); } catch (_) {}
  const f = document.createElement('form');
  f.method = 'post'; f.action = action; f.target = '_blank'; f.rel = 'noopener'; f.style.display = 'none';
  Object.entries(fields).forEach(([name, value]) => {
    const i = document.createElement('input'); i.type = 'hidden'; i.name = name; i.value = value; f.appendChild(i);
  });
  document.body.appendChild(f); f.submit(); f.remove();
}

$('#payList').addEventListener('click', e => {
  const a = e.target.closest('[data-pay]');
  if (!a) return;
  e.preventDefault();
  const k = a.dataset.pay;
  if (isSet(PAYFAST_LINKS[k]) && !(k === current && isGroup())) { window.open(PAYFAST_LINKS[k], '_blank', 'noopener'); return; }
  if (PAYFAST.enabled && PAYFAST.receiver) { goToPayfast(k); return; }
  alert('Online payment link is coming soon. Please WhatsApp us on ' + CONTACT.whatsappDisplay + ' and we will send you a payment link, eWallet or CashSend details.');
});

/* ---------- Return from PayFast (#paid / #cancelled) ---------- */
function showPayReturn() {
  const box = $('#payReturn'); if (!box) return;
  const h = location.hash;
  if (h !== '#paid' && h !== '#cancelled') { box.hidden = true; return; }
  let last = null; try { last = JSON.parse(localStorage.getItem('inreco_last_payment') || 'null'); } catch (_) {}
  const ref = last ? last.ref : '';
  const paid = h === '#paid';
  $('#payReturnTitle').textContent = paid ? '✅ Thank you for your payment' : 'Payment cancelled';
  $('#payReturnText').textContent = paid
    ? `PayFast will email you a receipt.${ref ? ` Your reference is ${ref}.` : ''} Now send us your answers and documents by WhatsApp or email, if you have not done so yet.`
    : 'No money was taken. You can try again below, or WhatsApp us for eWallet or CashSend details.';
  $('#payReturnWa').href = waLink(paid
    ? `Hi iNRECO, I have paid${last ? ` R${Math.round(+last.amount).toLocaleString('en-ZA').replace(/\u00a0|\s/g, ',')} for the ${last.pkg}` : ''} on PayFast.${ref ? ` Reference: ${ref}.` : ''}`
    : 'Hi iNRECO, I could not pay on PayFast. Please send me eWallet or CashSend details.');
  box.hidden = false;
  box.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', showPayReturn);

/* ---------- WhatsApp / email links ---------- */
function waLink(text) { return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`; }
function mailLink(subject, body) {
  // encodeURIComponent keeps spaces as %20 and new lines as %0A (works in Gmail, Outlook, Apple Mail)
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
}
function questionList(pkg) {
  let q = QUESTIONS.basic.slice();
  if (pkg !== 'basic') q = q.concat(['', '--- About the inspection / notice ---'], QUESTIONS.responseExtra);
  if (pkg === 'relief') q = q.concat(['', '--- Full Relief ---'], QUESTIONS.reliefExtra);
  return q;
}
function templateMessage(pkg) {
  const p = PACKAGES[pkg];
  const out = [`Hi iNRECO, I want the ${p.name} (${rand(p.price)}). Ref ${ORDER_REF}.`, 'My answers are after each question:', ''].concat(questionList(pkg));
  if (pkg !== 'basic') out.push('', 'I will attach the notice / order and the emails from the Department.');
  out.push('', 'I will attach my documents (photos or PDFs).', 'I agree that you may use my information only for my file (POPIA).');
  return out.join('\n');
}
function buildContactCards() {
  $('#contactGrid').innerHTML = Object.entries(PACKAGES).map(([k, p]) => {
    const msg = templateMessage(k);
    return `<div class="contact-card">
      <h3>${p.name}<span>${rand(p.price)}</span></h3>
      <div class="btns">
        <a class="btn btn-wa" data-wa="${k}" href="${waLink(msg)}" target="_blank" rel="noopener">WhatsApp the questions</a>
        <a class="btn btn-mail" data-mail="${k}" href="${mailLink('Order: ' + p.name + ' (' + rand(p.price) + ')', msg)}">Email the questions</a>
      </div></div>`;
  }).join('');
}

/* ---------- Submit: compile summary ---------- */
function labelFor(el) {
  if (el.dataset.label) return el.dataset.label;
  if (el.type === 'radio') {
    const grp = el.closest('div').querySelector('.qlabel') || el.closest('div').parentElement.querySelector('.qlabel');
    return grp ? grp.textContent.trim() : el.name;
  }
  const l = el.id && document.querySelector(`label[for="${el.id}"]`);
  if (!l) return el.name;
  const c = l.cloneNode(true); $$('.hint,.req', c).forEach(x => x.remove());
  return c.textContent.trim().replace(/\s+/g, ' ');
}
function visible(el) { return !el.closest('[hidden]'); }

function compile() {
  const p = PACKAGES[current], t = totals();
  const lines = [`iNRECO ORDER: ${p.name}`, `Reference: ${ORDER_REF}`, `Price: ${rand(t.total)}${t.n > 1 ? ` (${t.n} stores, ${GROUP_DISCOUNT.percent}% group discount)` : ''}`, ''];
  const files = [];
  const seen = new Set();
  $$('input,select,textarea', form).forEach(el => {
    if (!el.name || el.type === 'hidden' || !visible(el) || el.name === 'popia_consent') return;
    if (el.type === 'file') { Array.from(el.files).forEach(f => files.push(f.name)); return; }
    if (el.type === 'radio') {
      if (seen.has(el.name)) return; seen.add(el.name);
      const c = form.querySelector(`input[name="${el.name}"]:checked`);
      if (c) lines.push(`${labelFor(el)} ${c.value}`);
      return;
    }
    if (el.type === 'checkbox') { if (el.checked) lines.push(labelFor(el)); return; }
    let v = el.value.trim();
    if (!v) return;
    if (el.tagName === 'SELECT') v = el.options[el.selectedIndex].text;
    lines.push(`${labelFor(el)}: ${v}`);
  });
  const missing = DOCS.filter(([id]) => !form.elements[id].checked).map(d => d[1]);
  if (missing.length) lines.push('', 'Documents I do NOT have yet: ' + missing.join(', '));
  if (files.length) lines.push('', `Files I will attach (${files.length}): ` + files.join(', '));
  lines.push('', 'POPIA consent: Yes');
  return lines.join('\n');
}

function validate() {
  const errs = [];
  $$('.invalid').forEach(e => e.classList.remove('invalid'));
  [['#f_bizname', 'Business name'], ['#f_contact', 'Contact person'], ['#f_wa', 'WhatsApp number'], ['#f_sector', 'Industry']].forEach(([s, n]) => {
    const el = $(s); if (!el.value.trim()) { el.classList.add('invalid'); errs.push(n); }
  });
  const wa = $('#f_wa').value.replace(/\D/g, '');
  if (wa && (wa.length < 9 || wa.length > 12)) { $('#f_wa').classList.add('invalid'); errs.push('a valid WhatsApp number'); }
  const em = $('#f_email');
  if (em.value && !em.checkValidity()) { em.classList.add('invalid'); errs.push('a valid email'); }
  if (!$('#f_popia').checked) errs.push('POPIA consent (tick the box)');
  return errs;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const errs = validate(), box = $('#errors');
  if (errs.length) {
    box.hidden = false; box.innerHTML = '<b>Please add:</b> ' + errs.join(', ') + '.';
    const first = $('.invalid'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  box.hidden = true;
  const text = compile();
  const data = Object.fromEntries(new FormData(form).entries()); // eslint-disable-line no-unused-vars

  // TODO(Lovable backend): replace the WhatsApp/email hand-off with a real submit, e.g.
  //   await supabase.from('inspection_orders').insert({ package: current, total: totals().total, answers: data, summary: text });
  //   upload each input[type=file] to Supabase Storage, then call goToPayfast(current)
  //   (with a server, switch to a signed PayFast form + notify_url for the ITN callback).
  window.dispatchEvent(new CustomEvent('inspection:submit', { detail: { package: current, totals: totals(), summary: text } }));

  let waText = text;
  $('#truncNote').hidden = true;
  if (waText.length > WA_MAX_CHARS) { waText = waText.slice(0, WA_MAX_CHARS) + '\n…(full answers sent by email)'; $('#truncNote').hidden = false; }
  $('#resultText').textContent = text;
  $('#sendWa').href = waLink(waText + '\n\nI will attach my documents in this chat.');
  $('#sendMail').href = mailLink(`Order: ${PACKAGES[current].name} – ${$('#f_bizname').value.trim()}`, text + '\n\nMy documents are attached.');
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- Init ---------- */
$('#yr').textContent = new Date().getFullYear();
updateSector();
selectPackage('basic', false);
buildContactCards();
showPayReturn();
