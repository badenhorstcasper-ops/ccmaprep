/* Shared PayFast + WhatsApp/email helpers for iNRECO static pages.
   Uses PayFast Pay Now fields only — never put a merchant key or passphrase here. */
(function (w) {
  const CONTACT = {
    whatsapp: '27844027029',
    whatsappDisplay: '084 402 7029',
    email: 'info@inreco.co.za'
  };
  const WA_MAX_CHARS = 3500;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = n => 'R' + Math.round(n).toLocaleString('en-ZA').replace(/\u00a0|\s/g, ',');

  function makeOrderRef(prefix) {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 5).toUpperCase();
    return `${prefix}-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rnd}`;
  }

  function waLink(text) {
    return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
  }
  function mailLink(subject, body) {
    return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`;
  }

  function payfastPayload(cfg, opts) {
    const live = cfg.mode !== 'sandbox';
    const base = (cfg.siteUrl || '').replace(/#.*$/, '');
    const f = {
      cmd: '_paynow',
      receiver: live ? cfg.receiver : cfg.sandboxReceiver,
      return_url: `${base}#paid`,
      cancel_url: `${base}#cancelled`,
      notify_url: cfg.notifyUrl,
      name_first: (opts.nameFirst || '').trim().split(/\s+/)[0].slice(0, 100),
      email_address: opts.email || '',
      m_payment_id: opts.mPaymentId,
      amount: Number(opts.amount).toFixed(2),
      item_name: opts.itemName,
      item_description: (opts.itemDescription || '').slice(0, 255)
    };
    Object.keys(f).forEach(k => { if (!f[k]) delete f[k]; });
    return {
      action: live ? 'https://www.payfast.co.za/eng/process' : 'https://sandbox.payfast.co.za/eng/process',
      fields: f
    };
  }

  function goToPayfast(payload, storageValue, storageKey) {
    try { localStorage.setItem(storageKey || 'inreco_last_payment', JSON.stringify(storageValue)); } catch (_) {}
    const f = document.createElement('form');
    f.method = 'post'; f.action = payload.action; f.target = '_blank'; f.rel = 'noopener'; f.style.display = 'none';
    Object.entries(payload.fields).forEach(([name, value]) => {
      const i = document.createElement('input'); i.type = 'hidden'; i.name = name; i.value = value; f.appendChild(i);
    });
    document.body.appendChild(f); f.submit(); f.remove();
  }

  function showPayReturn(opts) {
    const box = opts.box;
    if (!box) return;
    const h = location.hash;
    if (h !== '#paid' && h !== '#cancelled') { box.hidden = true; return; }
    let last = null;
    try { last = JSON.parse(localStorage.getItem(opts.storageKey || 'inreco_last_payment') || 'null'); } catch (_) {}
    const paid = h === '#paid';
    const ref = last ? last.ref : '';
    opts.titleEl.textContent = paid
      ? (opts.paidTitle || '✅ Thank you for your payment')
      : (opts.cancelTitle || 'Payment cancelled');
    opts.textEl.textContent = paid
      ? (opts.paidText
          ? opts.paidText(last, ref)
          : `PayFast will email you a receipt.${ref ? ` Your reference is ${ref}.` : ''} Now send us your answers and documents by WhatsApp or email, if you have not done so yet.`)
      : (opts.cancelText || 'No money was taken. You can try again below, or WhatsApp us for eWallet or CashSend details.');
    if (opts.waEl) {
      opts.waEl.href = waLink(paid
        ? (last
            ? `Hi iNRECO, I have paid ${rand(+last.amount)} for the ${last.pkg} on PayFast.${ref ? ` Reference: ${ref}.` : ''}`
            : 'Hi iNRECO, I have paid on PayFast.')
        : 'Hi iNRECO, I could not pay on PayFast. Please send me eWallet or CashSend details.');
    }
    box.hidden = false;
    box.scrollIntoView({ block: 'start' });
  }

  function labelFor(el) {
    if (el.dataset.label) return el.dataset.label;
    if (el.type === 'radio') {
      const grp = el.closest('div').querySelector('.qlabel') || (el.closest('div') && el.closest('div').parentElement && el.closest('div').parentElement.querySelector('.qlabel'));
      return grp ? grp.textContent.trim() : el.name;
    }
    const l = el.id && document.querySelector(`label[for="${el.id}"]`);
    if (!l) return el.name;
    const c = l.cloneNode(true);
    $$('.hint,.req', c).forEach(x => x.remove());
    return c.textContent.trim().replace(/\s+/g, ' ');
  }
  function visible(el) { return !el.closest('[hidden]'); }

  function compileForm(form, headerLines, opts) {
    const lines = headerLines.slice();
    const files = [];
    const seen = new Set();
    const skip = (opts && opts.skipNames) || new Set(['popia_consent']);
    $$('input,select,textarea', form).forEach(el => {
      if (!el.name || el.type === 'hidden' || !visible(el) || skip.has(el.name)) return;
      if (el.type === 'file') { Array.from(el.files).forEach(f => files.push(f.name)); return; }
      if (el.type === 'radio') {
        if (seen.has(el.name)) return; seen.add(el.name);
        const c = form.querySelector(`input[name="${el.name}"]:checked`);
        if (c) lines.push(`${labelFor(el)}: ${c.value}`);
        return;
      }
      if (el.type === 'checkbox') { if (el.checked) lines.push(labelFor(el)); return; }
      let v = el.value.trim();
      if (!v) return;
      if (el.tagName === 'SELECT') v = el.options[el.selectedIndex].text;
      lines.push(`${labelFor(el)}: ${v}`);
    });
    if (opts && opts.missingDocs && opts.missingDocs.length) {
      lines.push('', 'Documents I do NOT have yet: ' + opts.missingDocs.join(', '));
    }
    if (files.length) lines.push('', `Files I will attach (${files.length}): ` + files.join(', '));
    lines.push('', 'POPIA consent: Yes');
    return lines.join('\n');
  }

  w.INRECO = {
    CONTACT, WA_MAX_CHARS, $, $$, rand, makeOrderRef, waLink, mailLink,
    payfastPayload, goToPayfast, showPayReturn, labelFor, visible, compileForm
  };
})(window);
