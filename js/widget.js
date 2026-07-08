/*
 * Giving gap calculator — widget behaviour.
 * DOM wiring only; all tax math lives in calculator.js (GivingGap).
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Mailchimp email capture.
   *
   * This is a static site (GitHub Pages, no backend), so the signup posts
   * straight to Mailchimp's embedded-form endpoint via JSONP — that avoids
   * exposing any API key and lets us keep the custom thank-you state with
   * real success/error feedback.
   *
   * To activate: paste the action URL from Mailchimp
   *   Audience -> Signup forms -> Embedded forms
   * into `action` below. It looks like:
   *   https://<something>.us21.list-manage.com/subscribe/post?u=abc123&id=def456
   *
   * `tags` is optional: comma-separated numeric tag id(s) to attach to guide
   * requesters. (Tagging via embedded forms is best-effort; if it doesn't
   * stick, apply the tag with a Mailchimp automation keyed to this audience.)
   *
   * While `action` is empty the form validates and shows the thank-you state
   * without subscribing anyone.
   * ------------------------------------------------------------------- */
  var MAILCHIMP = {
    action: '',
    tags: ''
  };

  var gg = window.GivingGap;

  var els = {
    province: document.getElementById('gg-province'),
    income: document.getElementById('gg-income'),
    worth: document.getElementById('gg-worth'),
    paid: document.getElementById('gg-paid'),
    aReceipt: document.getElementById('gg-a-receipt'),
    aCredit: document.getElementById('gg-a-credit'),
    aUnclaimedRow: document.getElementById('gg-a-unclaimed-row'),
    aUnclaimed: document.getElementById('gg-a-unclaimed'),
    aCapTax: document.getElementById('gg-a-captax'),
    aCost: document.getElementById('gg-a-cost'),
    bReceipt: document.getElementById('gg-b-receipt'),
    bCredit: document.getElementById('gg-b-credit'),
    bUnclaimedRow: document.getElementById('gg-b-unclaimed-row'),
    bUnclaimed: document.getElementById('gg-b-unclaimed'),
    bCost: document.getElementById('gg-b-cost'),
    savingsBlock: document.getElementById('gg-savings-block'),
    savings: document.getElementById('gg-savings'),
    noGain: document.getElementById('gg-no-gain'),
    form: document.getElementById('gg-form'),
    name: document.getElementById('gg-name'),
    email: document.getElementById('gg-email'),
    consent: document.getElementById('gg-consent'),
    limitNote: document.getElementById('gg-limit-note'),
    formError: document.getElementById('gg-form-error'),
    submit: document.getElementById('gg-submit'),
    sent: document.getElementById('gg-sent'),
    bookLink: document.getElementById('gg-book-link'),
    booking: document.getElementById('gg-booking'),
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

  /* ---- Embed auto-resize --------------------------------------------
   * When this widget is loaded inside an iframe (e.g. a Squarespace Code
   * Block), it reports its rendered height to the parent page so the host
   * iframe can grow and shrink with the content (mobile stacking, the
   * no-gain message, the thank-you state, the booking panel). The host
   * listens for { type: 'gg-height' } messages. Harmless when not framed:
   * the message just posts to this same window with no listener.
   * ----------------------------------------------------------------- */
  function measureHeight() {
    var body = document.body;
    var html = document.documentElement;
    return Math.max(
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0,
      html ? html.scrollHeight : 0,
      html ? html.offsetHeight : 0
    );
  }

  var heightPending = false;
  function postHeight() {
    if (heightPending) return;
    heightPending = true;
    requestAnimationFrame(function () {
      heightPending = false;
      try {
        parent.postMessage({ type: 'gg-height', height: measureHeight() }, '*');
      } catch (e) { /* cross-origin parent still accepts postMessage */ }
    });
  }

  /* ---- Number-roll on the savings figure ----------------------------
   * Under 400ms, ease-out, skipped when the visitor prefers reduced motion.
   * ----------------------------------------------------------------- */
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

  /* The 75%-of-net-income annual limit: explain the cap and the carryforward
     when the gift is larger than what can be claimed this year. */
  function limitNote(r) {
    if (!r.hasGain) {
      return 'You can claim the donation credit on up to 75% of net income, ' +
        fmt(r.ceilingB) + ', in one year and carry the remaining ' + fmt(r.deferredB) +
        ' forward up to five years. These figures show year one.';
    }
    if (r.cappedA && r.cappedB) {
      var lead = r.savings <= 0.005
        ? 'This gift is far larger than the income you entered, so the year-one view understates the benefit: selling first lets you claim much more of the credit now, while donating in kind defers more of it. '
        : '';
      return lead +
        'You can claim the donation credit on up to 75% of net income in one year, ' +
        fmt(r.ceilingB) + ' donating the shares directly or ' + fmt(r.ceilingA) +
        ' if you sell first (the sale adds to your income), and carry the rest forward up to five years. ' +
        'Over the life of the gift you still avoid ' + fmt(r.capTax) +
        ' in capital gains tax. These figures show year one.';
    }
    // In-kind capped, sell route claims the full amount this year.
    return 'Donating the shares directly, you can claim the credit on up to ' + fmt(r.ceilingB) +
      ' this year (75% of net income) and carry the remaining ' + fmt(r.deferredB) +
      ' forward up to five years. Selling first would let you claim the full amount now, because ' +
      'the sale adds to your income. These figures show year one.';
  }

  function update(animate) {
    var r = gg.compute({
      province: els.province.value,
      income: parse(els.income.value),
      worth: parse(els.worth.value),
      paid: parse(els.paid.value)
    });

    els.aReceipt.textContent = fmt(r.receipt);
    els.aCredit.textContent = '−' + fmt(r.creditA);
    els.aUnclaimedRow.hidden = !r.cappedA;
    els.aUnclaimed.textContent = fmt(r.deferredA);
    els.aCapTax.textContent = '+' + fmt(r.capTax);
    els.aCost.textContent = fmt(r.costA);
    els.bReceipt.textContent = fmt(r.receipt);
    els.bCredit.textContent = '−' + fmt(r.creditB);
    els.bUnclaimedRow.hidden = !r.cappedB;
    els.bUnclaimed.textContent = fmt(r.deferredB);
    els.bCost.textContent = fmt(r.costB);

    // Headline saving. Hidden when there's no gain, or when a heavy cap has
    // pushed the year-one saving to zero or below (the note carries the story).
    var showSavings = r.hasGain && r.savings > 0.005;
    els.savingsBlock.hidden = !showSavings;
    els.noGain.hidden = r.hasGain;
    if (showSavings) {
      if (animate) tweenTo(r.savings);
      else { tweenTarget = r.savings; renderSavings(r.savings); }
    } else {
      tweenTarget = 0;
      renderSavings(0);
    }

    var capped = r.cappedA || r.cappedB;
    els.limitNote.hidden = !capped;
    // The dagger ties the note back to the "Not claimable this year" card line.
    if (capped) els.limitNote.textContent = '† ' + limitNote(r);
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

  // Live updates: thousands formatting as the visitor types.
  [els.income, els.worth, els.paid].forEach(function (input) {
    input.addEventListener('input', function () {
      input.value = fmtInput(input.value);
      update(true);
    });
  });
  els.province.addEventListener('change', function () { update(true); });

  /* ---- Mailchimp subscribe (JSONP) ---------------------------------- */
  function stripHtml(msg) {
    if (!msg) return '';
    var d = document.createElement('div');
    d.innerHTML = String(msg);
    return (d.textContent || '').trim();
  }

  function subscribe(fields, onResult) {
    if (!MAILCHIMP.action) { onResult({ ok: true }); return; }

    // The embedded-form action ends in /post; the JSONP variant is /post-json.
    var base = MAILCHIMP.action.replace(/\/post(\?|$)/, '/post-json$1');
    var params = [];
    Object.keys(fields).forEach(function (k) {
      if (fields[k] !== '') params.push(encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]));
    });
    if (MAILCHIMP.tags) params.push('tags=' + encodeURIComponent(MAILCHIMP.tags));

    var cb = 'gg_mc_cb_' + Date.now();
    var script = document.createElement('script');
    var timer = setTimeout(function () { finish({ ok: false }); }, 10000);

    function finish(res) {
      clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      onResult(res);
    }

    window[cb] = function (data) {
      var ok = data && data.result === 'success';
      // Mailchimp returns an "error" when the address is already on the list;
      // for a guide request that's a fine outcome, so treat it as success.
      if (!ok && data && /already/i.test(data.msg || '')) ok = true;
      finish({ ok: ok, msg: stripHtml(data && data.msg) });
    };
    script.onerror = function () { finish({ ok: false }); };
    params.push('c=' + cb);
    script.src = base + (base.indexOf('?') === -1 ? '?' : '&') + params.join('&');
    document.body.appendChild(script);
  }

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
    els.submit.disabled = true;

    subscribe({ EMAIL: email, FNAME: els.name.value.trim() }, function (res) {
      els.submit.disabled = false;
      if (res.ok) {
        els.form.hidden = true;
        els.sent.hidden = false;
        postHeight();
      } else {
        els.formError.textContent = res.msg || 'Something went wrong sending that. Please try again in a moment.';
        els.formError.hidden = false;
      }
    });
  });

  // Booking: reveal the Microsoft Bookings iframe inline on request.
  els.bookLink.addEventListener('click', function (e) {
    e.preventDefault();
    var open = els.booking.hidden;
    els.booking.hidden = !open;
    els.bookLink.setAttribute('aria-expanded', String(open));
    postHeight();
  });

  // Keep the host iframe sized to the content through every layout change.
  if (window.ResizeObserver) {
    new ResizeObserver(postHeight).observe(document.body);
  } else {
    window.addEventListener('resize', postHeight);
  }
  window.addEventListener('load', postHeight);

  update(false);
  postHeight();
})();
