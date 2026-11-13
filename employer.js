/* CCMA Help on Demand for Employers – /employer/ */
const { CONTACT, WA_MAX_CHARS, LOCK, $, $$, rand, makeOrderRef, waLink, mailLink,
        payfastPayload, goToPayfast, payReturnLock, waitForPayment, compileForm } = window.INRECO;

const PAYFAST = {
  enabled: true,
  mode: 'live',
  receiver: '12090292',
  sandboxReceiver: '10000100',
  siteUrl: 'https://ccmaprep.inreco.co.za/employer',
  notifyUrl: LOCK.notifyUrl        // payment server (Cloudflare Worker) that confirms each payment
};

const PACKAGES = {
  check:      { name: 'Case Check', price: 1500, payName: 'iNRECO Case Check', code: 'c' },
  strategy:   { name: 'Assessment Report & Strategy', price: 3500, payName: 'iNRECO Assessment Report & Strategy', code: 's' },
  full:       { name: 'Full CCMA Pack', price: 6500, payName: 'iNRECO Full CCMA Pack', code: 'f' }
};
const URGENT_FEE = 1000;

const DOCS = [
  ['doc_referral', 'CCMA referral (Form 7.11)'],
  ['doc_setdown', 'Notice of set-down / hearing date'],
  ['doc_contract', 'Employment contract'],
  ['doc_charge', 'Charge sheet / disciplinary notice'],
  ['doc_minutes', 'Hearing minutes or recording'],
  ['doc_outcome', 'Dismissal / outcome letter'],
  ['doc_payslips', 'Payslips'],
  ['doc_messages', 'Emails or WhatsApp messages'],
  ['doc_witness', 'Witness statements'],
  ['doc_other', 'Other evidence']
];

const form = $('#packForm');
const ORDER_REF = makeOrderRef('CCE');
const STORE_KEY = 'inreco_last_payment_cce';
let current = 'check';

$('#docList').innerHTML = DOCS.map(([id, label]) => `
  <div class="doc">
    <label class="top"><input type="checkbox" name="${id}" value="Yes" data-label="Have: ${label}"> ${label}</label>
    <input type="file" name="${id}_file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.mp3,.m4a,.mp4" aria-label="Upload ${label}">
  </div>`).join('');
$$('#docList .doc').forEach(d => {
  const cb = $('input[type=checkbox]', d), f = $('input[type=file]', d);
  f.addEventListener('change', () => { if (f.files.length) cb.checked = true; });
});

function isUrgent() { return $('#f_urgent').checked; }
function pkgTotal(k) { return PACKAGES[k].price + (isUrgent() ? URGENT_FEE : 0); }
function itemName(k) { return PACKAGES[k].payName + (isUrgent() ? ' + Urgent' : ''); }

function selectPackage(pkg, scroll) {
  current = pkg;
  $('#packageInput').value = pkg;
  $$('.pack-card').forEach(c => c.classList.toggle('selected', c.dataset.pkg === pkg));
  updateSummary();
  if (scroll) $('#summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$$('.pack-card').forEach(btn => btn.addEventListener('click', () => selectPackage(btn.dataset.pkg, false)));
$('#f_urgent').addEventListener('change', () => {
  $('#urgentBar').classList.toggle('on', isUrgent());
  updateSummary();
});

function updateSummary() {
  const p = PACKAGES[current], total = pkgTotal(current);
  $('#sumName').textContent = p.name + (isUrgent() ? ' + Urgent' : '');
  $('#sumPrice').textContent = rand(p.price);
  $('#sumUrgentRow').hidden = !isUrgent();
  $('#sumUrgent').textContent = isUrgent() ? rand(URGENT_FEE) : '';
  $('#sumTotal').textContent = rand(total);
  $('#stickyName').textContent = p.name + (isUrgent() ? ' + Urgent' : '');
  $('#stickyPrice').textContent = rand(total);
  renderPay();
}

function renderPay() {
  $('#payList').innerHTML = Object.entries(PACKAGES).map(([k, p]) => {
    const on = k === current;
    return `<a class="btn paybtn ${on ? 'btn-primary' : 'dim'}" data-pay="${k}" href="#summary" rel="noopener">
      <span>${on ? 'Pay now: ' : ''}${p.name}${isUrgent() ? ' + Urgent' : ''}</span><span class="amt">${rand(pkgTotal(k))}</span></a>`;
  }).join('');
}

function emailIfValid() {
  const em = $('#f_email');
  return em && em.value && em.checkValidity() ? em.value.trim() : '';
}

function payfastFields(k) {
  const p = PACKAGES[k];
  const biz = ($('#f_bizname').value || '').trim().slice(0, 80);
  const desc = [`Ref ${ORDER_REF}`, biz, isUrgent() ? 'Urgent (hearing within 5 working days)' : '']
    .filter(Boolean).join(' | ');
  return payfastPayload(PAYFAST, {
    amount: pkgTotal(k),
    itemName: itemName(k),
    itemDescription: desc,
    mPaymentId: `${ORDER_REF}.${PACKAGES[k].code}${isUrgent() ? 'u' : ''}`,  // ref + package code: the payment server checks the price
    ref: ORDER_REF,
    nameFirst: ($('#f_contact').value || '').trim(),
    email: emailIfValid()
  });
}
window.payfastFields = payfastFields;
window.PAYFAST = PAYFAST;
window.ORDER_REF = ORDER_REF;

function showErrors(errs) {
  const box = $('#errors');
  box.hidden = false; box.innerHTML = '<b>Please add:</b> ' + errs.join(', ') + '.';
  const first = $('.invalid'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function compileAnswers(k) {
  const p = PACKAGES[k];
  const missing = DOCS.filter(([id]) => !form.elements[id].checked).map(d => d[1]);
  return compileForm(form, [
    `iNRECO ORDER: ${p.name}${isUrgent() ? ' + Urgent' : ''}`,
    `Reference: ${ORDER_REF}`,
    `Price: ${rand(pkgTotal(k))}`,
    ''
  ], { missingDocs: missing });
}

// Answers saved with the order, so the unlocked WhatsApp / email buttons carry them.
// Nothing filled in yet: the question list is sent instead (the "Prefer WhatsApp or email?" route).
function answersForPay(k) {
  const touched = ['#f_bizname', '#f_contact', '#f_wa', '#f_casetype'].some(s => $(s) && $(s).value.trim());
  if (!touched) return { text: templateMessage(k), filled: false };
  const errs = validate();
  if (errs.length) { showErrors(errs); return null; }
  $('#errors').hidden = true;
  return { text: compileAnswers(k), filled: true, biz: $('#f_bizname').value.trim() };
}

const lockOpts = {
  box: $('#payReturn'), titleEl: $('#payReturnTitle'), textEl: $('#payReturnText'), actionsEl: $('#payReturnActions'),
  storageKey: STORE_KEY,
  messages: (order, st, ref) => {
    const paidLine = `PAID on PayFast: ${rand(+st.amount)} for the ${st.item}. Ref ${ref}.`;
    const text = order && order.text ? order.text : templateMessage('check').replace(/^.*\n/, `Hi iNRECO, Ref ${ref}.\n`);
    return {
      wa: `${paidLine}\n\n${text}${order && order.filled ? '\n\nI will attach my documents in this chat.' : ''}`,
      mailSubject: `Order: ${st.item} (paid) – ${(order && order.biz) || ref}`,
      mailBody: `${paidLine}\n\n${text}\n\nMy documents are attached.`
    };
  }
};

$('#payList').addEventListener('click', e => {
  const a = e.target.closest('[data-pay]');
  if (!a) return;
  e.preventDefault();
  const k = a.dataset.pay;
  if (PAYFAST.enabled && PAYFAST.receiver) {
    const ans = answersForPay(k);
    if (!ans) return;
    const payload = payfastFields(k);
    goToPayfast(payload, { ref: ORDER_REF, pkg: itemName(k), amount: payload.fields.amount, at: Date.now(), ...ans }, STORE_KEY);
    waitForPayment(lockOpts, ORDER_REF);
    return;
  }
  alert('Online payment link is coming soon. Please WhatsApp us on ' + CONTACT.whatsappDisplay + ' and we will send you a payment link, eWallet or CashSend details.');
});

window.addEventListener('hashchange', () => payReturnLock(lockOpts));

function templateMessage(k) {
  const p = PACKAGES[k];
  return [
    `Hi iNRECO, I want the ${p.name} (${rand(pkgTotal(k))}${isUrgent() ? ', urgent' : ''}). Ref ${ORDER_REF}.`,
    'My answers are after each question:',
    '',
    'Business name:',
    'Contact person:',
    'WhatsApp number:',
    'Email:',
    'Case type (dismissal / unfair labour practice / retrenchment / unfair discrimination / other):',
    'CCMA case number:',
    'Date of conciliation:',
    'Date of arbitration / hearing:',
    'What happened:',
    'Documents I have (referral, set-down, contract, charge sheet, hearing minutes, outcome letter, payslips, messages, witness statements, other):',
    '',
    'I will attach my documents (photos or PDFs) in this chat or email.',
    'I agree that you may use my information only for my file (POPIA).'
  ].join('\n');
}

function buildContactCards() {
  // Before payment there are no WhatsApp / email send links: each card picks the package and goes to Pay.
  $('#contactGrid').innerHTML = Object.entries(PACKAGES).map(([k, p]) => `<div class="contact-card">
      <h3>${p.name}<span>${rand(pkgTotal(k))}</span></h3>
      <div class="btns">
        <button type="button" class="btn btn-primary" data-choose="${k}">Choose and pay</button>
      </div></div>`).join('');
}
$('#contactGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-choose]');
  if (b) selectPackage(b.dataset.choose, true);
});

function validate() {
  const errs = [];
  $$('.invalid').forEach(e => e.classList.remove('invalid'));
  [['#f_bizname', 'Business name'], ['#f_contact', 'Contact person'], ['#f_wa', 'WhatsApp number'], ['#f_casetype', 'Case type']].forEach(([s, n]) => {
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
  const errs = validate();
  if (errs.length) { showErrors(errs); return; }
  $('#errors').hidden = true;
  $('#resultText').textContent = compileAnswers(current);
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#yr').textContent = new Date().getFullYear();
selectPackage('check', false);
buildContactCards();
$('#f_urgent').addEventListener('change', buildContactCards);
payReturnLock(lockOpts);
