/* Shared PayFast + WhatsApp/email helpers for iNRECO static pages.
   Uses PayFast Pay Now fields only — never put a merchant key or passphrase here. */
(function (w) {
  const CONTACT = {
    whatsapp: '27844027029',
    whatsappDisplay: '084 402 7029',
    email: 'info@inreco.co.za'
  };
  const WA_MAX_CHARS = 3500;
  // Payment lock: a free Cloudflare Worker receives PayFast's payment notification (ITN), checks it with
  // PayFast and against its own price list, and only then reports the order as paid.
  const LOCK = {
    statusUrl: 'https://ccmaprep-pay.badenhorst-casper.workers.dev/status',
    notifyUrl: 'https://ccmaprep-pay.badenhorst-casper.workers.dev/itn',
    everyMs: 4000,       // check every 4 seconds
    returnMs: 120000,    // on the PayFast return page: keep checking for 2 minutes
    waitMs: 600000       // on the original tab while the client pays: keep checking for 10 minutes
  };
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
      return_url: `${base}${opts.ref ? `?ref=${encodeURIComponent(opts.ref)}` : ''}#paid`,
      cancel_url: `${base}${opts.ref ? `?ref=${encodeURIComponent(opts.ref)}` : ''}#cancelled`,
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

  function saveOrder(key, order) { try { localStorage.setItem(key, JSON.stringify(order)); } catch (_) {} }
  function loadOrder(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  const REF_RE = /^(INS|CCE|WRK)-\d{6}-[A-Z0-9]{5}$/;

  async function checkPaid(ref) {
    try {
      const r = await fetch(`${LOCK.statusUrl}?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' });
      if (!r.ok) return { paid: false };
      const j = await r.json();
      return j && j.paid === true ? j : { paid: false };
    } catch (_) { return { paid: false, offline: true }; }
  }

  /* Locked pay-return box. The WhatsApp / email send buttons are only CREATED after the payment
     server says paid:true for this reference; before that they do not exist on the page.
     o = { box, titleEl, textEl, actionsEl, storageKey, messages(order, status, ref) -> {wa, mailSubject, mailBody, waLabel, mailLabel},
           paidText(status, ref), cancelText } */
  let lock = { state: 'idle', timer: null, run: 0 };
  function setActions(o, nodes) {
    o.actionsEl.innerHTML = '';
    nodes.forEach(n => o.actionsEl.appendChild(n));
  }
  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (text) e.textContent = text;
    return e;
  }
  function showBox(o) { o.box.hidden = false; o.box.scrollIntoView({ block: 'start' }); }

  function showUnlocked(o, ref, status) {
    lock.state = 'paid';
    const order = loadOrder(o.storageKey);
    const mine = order && order.ref === ref ? order : null;
    if (mine && !mine.paid) { mine.paid = { amount: status.amount, item: status.item }; saveOrder(o.storageKey, mine); }
    const m = o.messages(mine, status, ref);
    o.titleEl.textContent = '✅ Payment confirmed';
    o.textEl.textContent = o.paidText
      ? o.paidText(status, ref)
      : `Thank you. We received ${rand(+status.amount)} for the ${status.item}. Your reference is ${ref}. Now send us your answers and documents by WhatsApp or email. Attach your documents in the same chat or email.`;
    let wa = m.wa;
    if (wa.length > WA_MAX_CHARS) wa = wa.slice(0, WA_MAX_CHARS) + '\n…(full answers sent by email)';
    const waBtn = el('a', { class: 'btn btn-wa', href: waLink(wa), target: '_blank', rel: 'noopener', id: 'sendWa' }, m.waLabel || 'Send my answers by WhatsApp');
    const mailBtn = el('a', { class: 'btn btn-mail', href: mailLink(m.mailSubject, m.mailBody), id: 'sendMail' }, m.mailLabel || 'Send my answers by email');
    const grid = el('div', { class: 'grid two', style: 'margin-top:10px;gap:12px' });
    grid.append(waBtn, mailBtn);
    setActions(o, [grid]);
    showBox(o);
  }

  function showNotYet(o, ref) {
    lock.state = 'timeout';
    o.titleEl.textContent = 'Payment not confirmed yet';
    o.textEl.textContent = `We have not received PayFast's confirmation for reference ${ref} yet. This can take a few minutes. If you have paid, don't worry: iNRECO sees every payment and will contact you.`;
    const again = el('button', { type: 'button', class: 'btn btn-primary' }, 'Tap to check again');
    again.addEventListener('click', () => startPolling(o, ref, LOCK.returnMs, false));
    setActions(o, [again]);
    showBox(o);
  }

  function startPolling(o, ref, maxMs, waiting) {
    const run = ++lock.run;
    clearTimeout(lock.timer);
    lock.state = 'polling';
    o.titleEl.textContent = waiting ? 'Waiting for your payment…' : 'Confirming your payment…';
    o.textEl.textContent = waiting
      ? `Finish paying in the PayFast tab. This page unlocks the WhatsApp and email buttons as soon as PayFast confirms your payment. Reference: ${ref}.`
      : `Please keep this page open. This takes a few seconds. Reference: ${ref}.`;
    setActions(o, [el('p', { class: 'small', role: 'status' }, '⏳ Checking with PayFast…')]);
    showBox(o);
    const until = Date.now() + maxMs;
    const tick = async () => {
      if (run !== lock.run) return;
      const st = await checkPaid(ref);
      if (run !== lock.run) return;
      if (st.paid) return showUnlocked(o, ref, st);
      if (Date.now() >= until) return showNotYet(o, ref);
      lock.timer = setTimeout(tick, LOCK.everyMs);
    };
    tick();
  }

  function payReturnLock(o) {
    if (!o.box) return;
    const h = location.hash;
    const qRef = (new URLSearchParams(location.search).get('ref') || '').toUpperCase();
    const order = loadOrder(o.storageKey);
    const ref = REF_RE.test(qRef) ? qRef : (order && REF_RE.test(order.ref) ? order.ref : '');
    if (h === '#paid') {
      if (lock.state === 'paid' || lock.state === 'polling') return;
      if (!ref) {
        o.titleEl.textContent = 'Payment not confirmed yet';
        o.textEl.textContent = "We could not find your order reference on this device. If you have paid, don't worry: iNRECO sees every payment and will contact you.";
        setActions(o, []); showBox(o); return;
      }
      return startPolling(o, ref, LOCK.returnMs, false);
    }
    if (h === '#cancelled') {
      if (lock.state === 'paid') return;
      ++lock.run; clearTimeout(lock.timer); lock.state = 'idle';
      o.titleEl.textContent = 'Payment cancelled';
      o.textEl.textContent = o.cancelText || 'No money was taken. You can try again below, or WhatsApp us for eWallet or CashSend details.';
      setActions(o, [el('a', { class: 'btn btn-wa', href: waLink('Hi iNRECO, I could not pay on PayFast. Please send me eWallet or CashSend details.'), target: '_blank', rel: 'noopener' }, 'WhatsApp us')]);
      showBox(o); return;
    }
    if (lock.state === 'idle') o.box.hidden = true;   // keep a waiting / confirmed box visible while the client clicks around
  }

  // Called right after the PayFast tab opens: this tab waits for the confirmation too.
  function waitForPayment(o, ref) { startPolling(o, ref, LOCK.waitMs, true); }

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
    CONTACT, WA_MAX_CHARS, LOCK, $, $$, rand, makeOrderRef, waLink, mailLink,
    payfastPayload, goToPayfast, saveOrder, loadOrder, checkPaid, payReturnLock, waitForPayment,
    labelFor, visible, compileForm
  };
})(window);
