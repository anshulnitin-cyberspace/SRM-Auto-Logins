/*
 * SRM Auto Login Ultra - High-Performance Google Auth Engine
 * Event-driven (single MutationObserver), zero-polling auto-login for
 * SRMIST Google accounts. Runs at document_start, exits in <1ms on valid
 * sessions, and rides SPA step transitions without setInterval loops.
 *
 * Functional parity with the proven thenabbu/srm-auto-login flow:
 * URL-routed stages, robust click selectors, /confirmidentifier handling,
 * wrong-password session halt, Google account-chooser auto-selection
 * (saved account first, else any SRM session) + password obfuscation.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * STEP 2.1: Immediate Fast-Exit Guard (sub-millisecond)
   * ------------------------------------------------------------------ */
  const CURRENT_URL = location.href;
  const LOGIN_PATH_MARKERS = ['/signin/', '/v3/signin/', '/ServiceLogin', '/InteractiveLogin'];
  const BARE_LOGIN_URL = /^https:\/\/accounts\.google\.com\/?(\?.*)?$/;

  if (!LOGIN_PATH_MARKERS.some((m) => CURRENT_URL.includes(m)) && !BARE_LOGIN_URL.test(CURRENT_URL)) {
    return;
  }
  // Already an active Google session / signed-in chrome -> terminate immediately.
  if (document.querySelector('#gb, a[aria-label*="Google Account"]')) return;

  /* ------------------------------------------------------------------ *
   * STEP 2.2: Native Value Setter (beats React prototype overrides)
   * ------------------------------------------------------------------ */
  const injectNativeValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const qs = (sel) => document.querySelector(sel);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------------ *
   * STEP 2.3: Session Guards
   * ------------------------------------------------------------------ */
  const isHalted = () => sessionStorage.getItem('srm_autologin_halted') === '1';
  const haltSession = () => sessionStorage.setItem('srm_autologin_halted', '1');

  const CHALLENGE_SELECTORS = [
    '#totpPin',
    'input[name="totpPin"]',
    '[data-challengetype]',
    '[aria-label*="verification" i]',
    '[aria-label*="authenticator" i]',
    'iframe[src*="recaptcha"]',
    'iframe[src*="captcha"]'
  ];
  const isChallengeScreen = () => {
    const url = location.href;
    if (
      url.includes('/challenge/pwd') ||
      url.includes('/signin/v2/sl/pwd') ||
      url.includes('/identifier') ||
      BARE_LOGIN_URL.test(url)
    ) {
      return false;
    }
    return CHALLENGE_SELECTORS.some((sel) => qs(sel));
  };

  // Never touch Google's post-login housekeeping pages.
  const POST_LOGIN_MARKERS = ['/welcome', '/checkup', '/recovery'];

  /* ------------------------------------------------------------------ *
   * STEP 2.4: Reference-grade Next/Submit clicker
   * ------------------------------------------------------------------ */
  const clickNext = (step) => {
    const primary =
      step === 'identifier'
        ? ['#identifierNext', '[data-idom-class="nCP5yc"] button', 'button[jsname="LgbsSe"]']
        : ['#passwordNext', '[data-idom-class="nCP5yc"] button', 'button[jsname="LgbsSe"]'];
    for (const sel of primary) {
      const btn = qs(sel);
      if (btn) {
        btn.click();
        return true;
      }
    }
    const textBtn = [...document.querySelectorAll('button')].find(
      (b) => b.innerText && /next|sign in|continue/i.test(b.innerText)
    );
    if (textBtn) {
      textBtn.click();
      return true;
    }
    return false;
  };

  /* ------------------------------------------------------------------ *
   * STEP 2.5: Event-driven waiter.
   * Resolved by the single observer below when a selector appears;
   * the timeout is a one-shot safety bound, never a polling loop.
   * ------------------------------------------------------------------ */
  const pendingWaiters = new Set();
  const waitForSelector = (selector, timeout = 6000) => {
    const found = qs(selector);
    if (found) return Promise.resolve(found);
    return new Promise((resolve) => {
      const waiter = {
        selector,
        done: (el) => {
          clearTimeout(waiter.timer);
          pendingWaiters.delete(waiter);
          resolve(el);
        },
        timer: setTimeout(() => waiter.done(null), timeout)
      };
      pendingWaiters.add(waiter);
    });
  };
  const checkWaiters = () => {
    for (const w of [...pendingWaiters]) {
      const el = qs(w.selector);
      if (el) w.done(el);
    }
  };

  /* Displayed email detection for multi-account matching. */
  const findDisplayedEmail = () => {
    const dataEmail = qs('[data-email]');
    if (dataEmail && dataEmail.getAttribute('data-email')) {
      return dataEmail.getAttribute('data-email');
    }
    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      const text = [el.getAttribute('aria-label'), el.getAttribute('title')]
        .filter(Boolean)
        .join(' ');
      const m = text.match(/[a-z0-9._%+-]+@srmist\.edu\.in/i);
      if (m) return m[0];
    }
    return '';
  };

  const pickPreferred = (enabled, activeAccountId) => {
    if (!enabled.length) return null;

    const chosenId = sessionStorage.getItem('srm_chosen_id');
    if (chosenId) {
      const picked = enabled.find((a) => a.id === chosenId);
      if (picked) return picked;
    }

    const displayed = normalizeEmail(findDisplayedEmail());
    if (displayed) {
      const matched = enabled.find((a) => a.email === displayed);
      if (matched) return matched;
    }

    return enabled.find((a) => a.id === activeAccountId) || enabled[0];
  };

  const getPreferredAccount = async () => {
    const { accounts, activeAccountId } = await loadAccounts();
    const enabled = accounts.filter((a) => a && a.email && a.password && a.enabled !== false);
    return pickPreferred(enabled, activeAccountId);
  };

  const markUsed = (accountId) => {
    browserApi.storage.local.get('srm_accounts', (items) => {
      const accounts = Array.isArray(items.srm_accounts) ? items.srm_accounts : [];
      const idx = accounts.findIndex((a) => a.id === accountId);
      if (idx >= 0) {
        accounts[idx].lastUsed = new Date().toISOString();
        browserApi.storage.local.set({ srm_accounts: accounts });
      }
    });
  };

  /* ------------------------------------------------------------------ *
   * Account Chooser detection & auto-selection.
   * Google's "Choose an account" screen lists signed-out accounts in
   * cards carrying data-identifier / data-email or the email in text.
   * ------------------------------------------------------------------ */
  const CHOOSER_SELECTORS = ['[data-identifier]', '.W7322c', '[role="link"]', 'li'];

  const findAccountChooserItem = (email) => {
    const normalized = normalizeEmail(email);
    const netId = normalized.replace('@srmist.edu.in', '');

    for (const sel of CHOOSER_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const dataId = el.getAttribute('data-identifier') || '';
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        const haystack = `${dataId} ${text}`.toLowerCase();
        if (!haystack.includes('srmist.edu.in')) continue;

        if (dataId && normalizeEmail(dataId) === normalized) return el;
        if (netId && haystack.includes(netId)) return el;
      }
    }
    return null;
  };

  // First chooser card that carries an SRM-domain session (no saved match).
  const findFirstSrmChooserItem = () => {
    for (const sel of CHOOSER_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const dataId = el.getAttribute('data-identifier') || '';
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (`${dataId} ${text}`.toLowerCase().includes('srmist.edu.in')) return el;
      }
    }
    return null;
  };

  // Click that survives Google's custom UI handlers (click + Enter keys).
  const nativeClick = (el) => {
    try {
      el.click();
    } catch (_) {}
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
    }));
    el.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
    }));
  };

  /* ------------------------------------------------------------------ *
   * STEP 2.6: Flow Steps
   * ------------------------------------------------------------------ */
  const fillEmail = async (account) => {
    const emailInput = await waitForSelector('input[type="email"]');
    if (!emailInput || isHalted() || location.href.includes('/challenge/pwd')) return;

    if (normalizeEmail(emailInput.value) === account.email) {
      toast('Filling email...');
      await delay(250);
      clickNext('identifier');
      return;
    }
    emailInput.focus();
    injectNativeValue(emailInput, account.email);
    toast('Filling email...');
    await delay(250);
    clickNext('identifier');
  };

  const handleEmailStep = async () => {
    if (isHalted()) return;
    const { accounts, activeAccountId } = await loadAccounts();
    const enabled = accounts.filter((a) => a.enabled !== false && a.email && a.password);
    if (!enabled.length) return;

    // Wait for either the login form or Google's "Choose an account" screen.
    const first = await waitForSelector('input[type="email"], [data-identifier], .W7322c');
    if (!first || isHalted()) return;

    // Google "Choose an account" screen: auto-select the preferred saved account.
    const preferred = pickPreferred(enabled, activeAccountId);
    if (preferred) {
      const item = findAccountChooserItem(preferred.email);
      if (item) {
        nativeClick(item);
        toast('Signing in...');
        return;
      }
    }

    // Saved account not listed -> use the first available SRM session.
    const anySrm = findFirstSrmChooserItem();
    if (anySrm) {
      nativeClick(anySrm);
      toast('Signing in...');
      return;
    }

    await fillEmail(enabled[0]);
  };

  const handlePasswordStep = async () => {
    if (isHalted()) return;
    const pwInput = await waitForSelector('input[type="password"]');
    if (!pwInput || isHalted()) return;

    const account = await getPreferredAccount();
    if (!account) return;
    const password = _decode(account.password);
    if (!password) return;

    pwInput.focus();
    injectNativeValue(pwInput, password);
    toast('Filling password...');
    await delay(250);
    if (!clickNext('password')) return;

    await delay(1800);

    const stillOnPwd =
      location.href.includes('/challenge/pwd') || location.href.includes('/signin/v2/sl/pwd');
    const errorEl = qs('[data-error-code], .Ekjuhf, [jsname="B34EJ"]');
    if (stillOnPwd && errorEl && errorEl.innerText.trim()) {
      haltSession();
      toast('Wrong password - auto-login halted');
      return;
    }
    markUsed(account.id);
    toast('Signed in');
  };

  const handleConfirmIdentifier = async () => {
    await delay(250);
    clickNext('identifier');
  };

  /* ------------------------------------------------------------------ *
   * STEP 2.7: URL Router (stage machine)
   * ------------------------------------------------------------------ */
  const route = () => {
    if (isHalted()) return;
    if (isChallengeScreen()) {
      toast('2FA detected - login paused');
      return;
    }

    const url = location.href;
    if (POST_LOGIN_MARKERS.some((m) => url.includes(m))) return;
    if (url.includes('/confirmidentifier')) {
      handleConfirmIdentifier();
      return;
    }
    if (
      url.includes('/identifier') ||
      url.includes('/signin/v2/identifier') ||
      url.includes('/v3/signin/identifier') ||
      url.includes('/ServiceLogin') ||
      url.includes('/InteractiveLogin') ||
      BARE_LOGIN_URL.test(url)
    ) {
      handleEmailStep();
      return;
    }
    if (url.includes('/challenge/pwd') || url.includes('/signin/v2/sl/pwd')) {
      handlePasswordStep();
      return;
    }
    // Unrecognized URL: fall back to DOM detection.
    if (qs('input[type="password"]')) handlePasswordStep();
    else if (qs('input[type="email"]')) handleEmailStep();
  };

  /* ------------------------------------------------------------------ *
   * Minimal UI: toast + account chooser (no heavy wrappers)
   * ------------------------------------------------------------------ */
  let toastTimer = null;
  const toast = (message) => {
    document.getElementById('srm-al-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'srm-al-toast';
    el.textContent = message;
    el.style.cssText =
      'position:fixed;bottom:20px;left:20px;z-index:2147483647;background:#111;color:#eee;' +
      'border:1px solid #333;border-radius:4px;padding:8px 12px;' +
      'font:11px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;opacity:0;' +
      'transition:opacity .18s ease;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3)';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = '1')));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }, 2500);
  };

  /* ------------------------------------------------------------------ *
   * Single MutationObserver: URL-change routing + waiter wake-ups.
   * ------------------------------------------------------------------ */
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      route();
    } else {
      checkWaiters();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', route, { once: true });
  } else {
    route();
  }
})();