/*
 * Giving gap calculator — widget behaviour.
 * DOM wiring only; all tax math lives in calculator.js (GivingGap).
 */
(function () {
  'use strict';

  var gg = window.GivingGap;

  var els = {
    province: document.getElementById('gg-province'),
    income: document.getElementById('gg-income'),
    worth: document.getElementById('gg-worth'),
    paid: document.getElementById('gg-paid'),
    aReceipt: document.getElementById('gg-a-receipt'),
    aCredit: document.getElementById('gg-a-credit'),
    aCapTax: document.getElementById('gg-a-captax'),
    aCost: document.getElementById('gg-a-cost'),
    bReceipt: document.getElementById('gg-b-receipt'),
    bCredit: document.getElementById('gg-b-credit'),
    bCost: document.getElementById('gg-b-cost'),
    savingsBlock: document.getElementById('gg-savings-block'),
    savings: document.getElementById('gg-savings'),
    noGain: document.getElementById('gg-no-gain'),
    form: document.getElementById('gg-form'),
    name: document.getElementById('gg-name'),
    email: document.getElementById('gg-email'),
    consent: document.getElementById('gg-consent'),
    formError: document.getElementById('gg-form-error'),
    sent: document.getElementById('gg-sent'),
    ratesStamp: document.getElementById('gg-rates-stamp')
  };

  function parse(s) {
    return Number(String(s).replace(/[^0-9]/g, '')) || 0;
  }

  function fmtInput(s) {
    var digits = String(s).replace(/[^0-9]/g, '').slice(0, 12);
    return digits ? Number(digits).toLocaleString('en-CA') : '';
  }

  function fmt(n) {
    return '$' + Math.round(n).toLocaleString('en-CA');
  }

  /* Number-roll on the savings figure: under 400ms, ease-out, and skipped
     entirely when the visitor prefers reduced motion (WCAG). */
  var shownSavings = 0;
  var tweenTarget;
  var raf = null;

  function renderSavings(value) {
    shownSavings = value;
    els.savings.textContent = fmt(value);
  }

  function tweenTo(target) {
    if (tweenTarget === target) return;
    tweenTarget = target;
    if (raf) cancelAnimationFrame(raf);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { renderSavings(target); return; }
    var from = shownSavings;
    var start = performance.now();
    var dur = 350;
    var step = function (now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      renderSavings(from + (target - from) * e);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function update(animate) {
    var r = gg.compute({
      province: els.province.value,
      income: parse(els.income.value),
      worth: parse(els.worth.value),
      paid: parse(els.paid.value)
    });

    els.aReceipt.textContent = fmt(r.receipt);
    els.aCredit.textContent = '−' + fmt(r.credit);
    els.aCapTax.textContent = '+' + fmt(r.capTax);
    els.aCost.textContent = fmt(r.costA);
    els.bReceipt.textContent = fmt(r.receipt);
    els.bCredit.textContent = '−' + fmt(r.credit);
    els.bCost.textContent = fmt(r.costB);

    els.savingsBlock.hidden = !r.hasGain;
    els.noGain.hidden = r.hasGain;
    if (r.hasGain) {
      if (animate) tweenTo(r.savings);
      else { tweenTarget = r.savings; renderSavings(r.savings); }
    } else {
      tweenTarget = 0;
      renderSavings(0);
    }
  }

  // Province dropdown, 13 options.
  gg.PROVINCES.forEach(function (p) {
    var opt = document.createElement('option');
    opt.value = p.code;
    opt.textContent = p.name;
    els.province.appendChild(opt);
  });
  els.province.value = 'ON';

  els.ratesStamp.textContent = gg.RATES_AS_OF;

  // Live updates: thousands formatting as the visitor types, caret pinned
  // to the end of the digits they own.
  [els.income, els.worth, els.paid].forEach(function (input) {
    input.addEventListener('input', function () {
      input.value = fmtInput(input.value);
      update(true);
    });
  });
  els.province.addEventListener('change', function () { update(true); });

  // Email capture. The result is free and never gated; the email earns the
  // guide, nothing else. Delivery wiring (serverless endpoint + Mailchimp
  // tag) is pending — see README.
  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = els.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      els.formError.textContent = 'That email doesn’t look quite right. One more try?';
      els.formError.hidden = false;
      return;
    }
    if (!els.consent.checked) {
      els.formError.textContent = 'Tick the consent box and the guide is yours.';
      els.formError.hidden = false;
      return;
    }
    els.formError.hidden = true;
    els.form.hidden = true;
    els.sent.hidden = false;
  });

  update(false);
})();
