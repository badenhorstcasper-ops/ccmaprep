/* R250 worker case check – /worker/ */
const { CONTACT, WA_MAX_CHARS, $, $$, rand, makeOrderRef, waLink, mailLink,
        payfastPayload, goToPayfast, showPayReturn, compileForm } = window.INRECO;

const PAYFAST = {
  enabled: true,
  mode: 'live',
  receiver: '12090292',
  sandboxReceiver: '10000100',
  siteUrl: 'https://ccmaprep.inreco.co.za/worker/',
  notifyUrl: ''
};

const PKG = { name: 'Worker Case Check', price: 250, payName: 'iNRECO Worker Case Check' };
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
    mPaymentId: ORDER_REF,
    nameFirst: name,
    email: emailIfValid()
  });
}
window.payfastFields = payfastFields;
window.PAYFAST = PAYFAST;
window.ORDER_REF = ORDER_REF;

function goPay(e) {
  if (e) e.preventDefault();
  if (PAYFAST.enabled && PAYFAST.receiver) {
    const payload = payfastFields();
    goToPayfast(payload, { ref: ORDER_REF, pkg: PKG.name, amount: payload.fields.amount, at: Date.now() }, STORE_KEY);
    return;
  }
  alert('Please WhatsApp us on ' + CONTACT.whatsappDisplay + ' and we will send you a payment link, eWallet or CashSend details.');
}
$$('[data-pay]').forEach(a => a.addEventListener('click', goPay));

function bindPayReturn() {
  showPayReturn({
    box: $('#payReturn'),
    titleEl: $('#payReturnTitle'),
    textEl: $('#payReturnText'),
    waEl: $('#payReturnWa'),
    storageKey: STORE_KEY,
    paidTitle: '✅ Thank you for your payment',
    paidText: (last, ref) => `Thank you. PayFast will send you a receipt.${ref ? ` Your number is ${ref}.` : ''} Now send us your answers and papers on WhatsApp, if you have not done so yet.`,
    cancelText: 'No money was taken. You can try again, or WhatsApp us for eWallet or CashSend details.'
  });
}
window.addEventListener('hashchange', bindPayReturn);

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
  const errs = validate(), box = $('#errors');
  if (errs.length) {
    box.hidden = false; box.innerHTML = '<b>Please fill in:</b> ' + errs.join(', ') + '.';
    const first = $('.invalid'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  box.hidden = true;
  const text = compileForm(form, [
    `iNRECO ORDER: ${PKG.name}`,
    `Reference: ${ORDER_REF}`,
    `Price: ${rand(PKG.price)}`,
    ''
  ]);
  let waText = text;
  $('#truncNote').hidden = true;
  if (waText.length > WA_MAX_CHARS) { waText = waText.slice(0, WA_MAX_CHARS) + '\n…(full answers sent by email)'; $('#truncNote').hidden = false; }
  $('#resultText').textContent = text;
  $('#sendWa').href = waLink(waText + '\n\nI will attach my papers (photos or PDFs) in this chat.');
  $('#sendMail').href = mailLink(`Order: ${PKG.name} – ${$('#f_name').value.trim()}`, text + '\n\nMy papers are attached.');
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#yr').textContent = new Date().getFullYear();
bindPayReturn();
