/* R250 worker case check – /worker */
const { CONTACT, WA_MAX_CHARS, LOCK, $, $$, rand, makeOrderRef, waLink, mailLink,
        payfastPayload, goToPayfast, payReturnLock, waitForPayment, compileForm } = window.INRECO;

const PAYFAST = {
  enabled: true,
  mode: 'live',
  receiver: '12090292',
  sandboxReceiver: '10000100',
  siteUrl: 'https://ccmaprep.inreco.co.za/worker',
  notifyUrl: LOCK.notifyUrl        // payment server (Cloudflare Worker) that confirms each payment
};

const PKG = { name: 'Worker Case Check', price: 250, payName: 'iNRECO Worker Case Check', code: 'w' };
const form = $('#packForm');
const ORDER_REF = makeOrderRef('WRK');
const STORE_KEY = 'inreco_last_payment_wrk';

function emailIfValid() {
  const em = $('#f_email');
  if (!em) return '';
  return em.value && em.checkValidity() ? em.value.trim() : '';
}

function payfastFields() {
  const name = ($('#f_name').value || '').trim();
  const desc = [`Ref ${ORDER_REF}`, name].filter(Boolean).join(' | ');
  return payfastPayload(PAYFAST, {
    amount: PKG.price,
    itemName: PKG.payName,
    itemDescription: desc,
    mPaymentId: `${ORDER_REF}.${PKG.code}`,   // ref + package code, so the payment server can check the price
    ref: ORDER_REF,
    nameFirst: name,
    email: emailIfValid()
  });
}
window.payfastFields = payfastFields;
window.PAYFAST = PAYFAST;
window.ORDER_REF = ORDER_REF;

function templateMessage(ref) {
  return [
    `Hi iNRECO, I want the ${PKG.name} (${rand(PKG.price)}). Ref ${ref}.`,
    'My answers are after each question:', '',
    'Your name:', 'Your WhatsApp number:', 'Who is your employer?:', 'When were you fired, or when was the problem?:',
    'What happened?:', 'CCMA case number (if you have one):', '',
    'I will attach my papers (photos or PDFs) in this chat or email.',
    'I agree that iNRECO may use my information only to help with my case (POPIA).'
  ].join('\n');
}

function showErrors(errs) {
  const box = $('#errors');
  box.hidden = false; box.innerHTML = '<b>Please fill in:</b> ' + errs.join(', ') + '.';
  const first = $('.invalid'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function compileAnswers() {
  return compileForm(form, [`iNRECO ORDER: ${PKG.name}`, `Reference: ${ORDER_REF}`, `Price: ${rand(PKG.price)}`, '']);
}

// Answers saved with the order, so the unlocked WhatsApp / email buttons carry them.
// Untouched form (e.g. the sticky Pay button): the question list is sent instead.
function answersForPay() {
  const touched = ['#f_name', '#f_wa', '#f_employer', '#f_what'].some(s => $(s) && $(s).value.trim());
  if (!touched) return { text: templateMessage(ORDER_REF), filled: false };
  const errs = validate();
  if (errs.length) { showErrors(errs); return null; }
  $('#errors').hidden = true;
  return { text: compileAnswers(), filled: true, name: $('#f_name').value.trim() };
}

const lockOpts = {
  box: $('#payReturn'), titleEl: $('#payReturnTitle'), textEl: $('#payReturnText'), actionsEl: $('#payReturnActions'),
  storageKey: STORE_KEY,
  paidText: (st, ref) => `Thank you. PayFast says you paid ${rand(+st.amount)}. Your number is ${ref}. Now send us your answers and papers on WhatsApp or email.`,
  cancelText: 'No money was taken. You can try again, or WhatsApp us for eWallet or CashSend details.',
  messages: (order, st, ref) => {
    const paidLine = `PAID on PayFast: ${rand(+st.amount)} for the ${st.item}. Ref ${ref}.`;
    const text = order && order.text ? order.text : templateMessage(ref);
    const filled = order && order.filled;
    return {
      wa: `${paidLine}\n\n${text}${filled ? '\n\nI will attach my papers (photos or PDFs) in this chat.' : ''}`,
      mailSubject: `Order: ${PKG.name} (paid) – ${(order && order.name) || ref}`,
      mailBody: `${paidLine}\n\n${text}\n\nMy papers are attached.`,
      waLabel: 'Send on WhatsApp', mailLabel: 'Send by email'
    };
  }
};

function goPay(e) {
  if (e) e.preventDefault();
  if (PAYFAST.enabled && PAYFAST.receiver) {
    const ans = answersForPay();
    if (!ans) return;
    const payload = payfastFields();
    goToPayfast(payload, { ref: ORDER_REF, pkg: PKG.name, amount: payload.fields.amount, at: Date.now(), ...ans }, STORE_KEY);
    waitForPayment(lockOpts, ORDER_REF);
    return;
  }
  alert('Please WhatsApp us on ' + CONTACT.whatsappDisplay + ' and we will send you a payment link, eWallet or CashSend details.');
}
$$('[data-pay]').forEach(a => a.addEventListener('click', goPay));

window.addEventListener('hashchange', () => payReturnLock(lockOpts));

function validate() {
  const errs = [];
  $$('.invalid').forEach(e => e.classList.remove('invalid'));
  [['#f_name', 'your name'], ['#f_wa', 'your WhatsApp number']].forEach(([s, n]) => {
    const el = $(s); if (!el.value.trim()) { el.classList.add('invalid'); errs.push(n); }
  });
  const wa = $('#f_wa').value.replace(/\D/g, '');
  if (wa && (wa.length < 9 || wa.length > 12)) { $('#f_wa').classList.add('invalid'); errs.push('a valid WhatsApp number'); }
  if (!$('#f_popia').checked) errs.push('the agreement box at the bottom');
  return errs;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const errs = validate();
  if (errs.length) { showErrors(errs); return; }
  $('#errors').hidden = true;
  $('#resultText').textContent = compileAnswers();
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#yr').textContent = new Date().getFullYear();
payReturnLock(lockOpts);
