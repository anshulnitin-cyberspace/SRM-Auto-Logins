/*
 * SRM Auto Login Ultra - High-Performance Engine
 * Event-driven, zero-polling auto-login for SRM Google accounts.
 * Runs at document_start, exits in <1ms on valid sessions, and uses a
 * MutationObserver (never setInterval) to ride SPA step transitions.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * STEP 2.1: Immediate Fast-Exit Guard (sub-millisecond)
   * ------------------------------------------------------------------ */
  const CURRENT_URL = window.location.href;

  // Already inside an active Google session -> never touch the DOM.
  const ACTIVE_SESSION_PATHS = ['/mail/u/0/', '/drive/u/0/', 'myaccount.google.com'];
  // Only proceed on pages that look like a login flow.
  const LOGIN_PATH_MARKERS = [
    '/signin/',
    '/v3/signin/',
    '/ServiceLogin',
    '/InteractiveLogin',
    '/youLogin.jsp'
  ];

  if (ACTIVE_SESSION_PATHS.some((m) => CURRENT_URL.includes(m))) return;
  if (!LOGIN_PATH_MARKERS.some((m) => CURRENT_URL.includes(m))) return;

  // DOM already shows signed-in chrome -> terminate before touching anything.
  if (document.querySelector('#gb, a[aria-label*="Google Account"]')) return;

  /* ------------------------------------------------------------------ *
   * STEP 2.2: Native Value Setter
   * Overrides the prototype setters Google/React/Angular hijack so that
   * .value assignments are actually observed by the SPA framework.
   * ------------------------------------------------------------------ */
  const injectNativeValue = (element, value) => {
    const proto =
      element instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /* ------------------------------------------------------------------ *
   * STEP 2.3: Credential Retrieval & Formatting
   * ------------------------------------------------------------------ */
  const getCredentials = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(['username', 'password'], (items) =>
        resolve({
          username: String(items.username || '').trim(),
          password: String(items.password || '').trim()
        })
      );
    });

  // True on SRM portals (sp.srmist.edu.in, *.srmist.edu.in); false on accounts.google.com.
  const IS_SRM_PORTAL = /(^|\.)srmist\.edu\.in$/.test(window.location.hostname);

  // Raw NetID ("ab1234") -> full SRM email for standard Google login fields.
  // SRM-specific NetID portals keep the raw NetID untouched.
  const formatUsername = (username, useEmailDomain) => {
    if (!username) return '';
    if (useEmailDomain && !username.includes('@')) return username + '@srmist.edu.in';
    return username;
  };

  /* ------------------------------------------------------------------ *
   * STEP 2.4: Fast-Path Fill + Dynamic Observation (SPA handling)
   * ------------------------------------------------------------------ */
  const EMAIL_SELECTOR =
    'input[type="email"], #identifierId, input[name="identifier"], ' +
    'input[name="username"], input[id*="User"]';
  const PASSWORD_SELECTOR =
    'input[type="password"], input[name="password"], input[name="Passwd"]';

  let observer = null;

  const stopObservation = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const attemptFill = ({ username, password } = {}) => {
    // Signed-in chrome appeared without any login form -> stop watching.
    if (document.querySelector('#gb, a[aria-label*="Google Account"]')) {
      stopObservation();
      return;
    }

    const emailInput = document.querySelector(EMAIL_SELECTOR);
    const passwordInput = document.querySelector(PASSWORD_SELECTOR);
    const emailValue = emailInput ? formatUsername(username, !IS_SRM_PORTAL) : null;
    const passwordValue = passwordInput ? password : null;

    // Single-form portals: username + password visible on the same page.
    if (emailInput && passwordInput) {
      if (emailValue && !emailInput.value) injectNativeValue(emailInput, emailValue);
      if (passwordValue && !passwordInput.value) injectNativeValue(passwordInput, passwordValue);
      const submit = document.querySelector(
        '#passwordNext, #passwordNext button, #submit, button[type="submit"], input[type="submit"]'
      );
      if (submit) submit.click();
      stopObservation(); // final step complete.
      return;
    }

    // Google SPA, email/NetID step.
    if (emailInput && emailValue && !emailInput.value) {
      injectNativeValue(emailInput, emailValue);
      const next = document.querySelector(
        '#identifierNext, #identifierNext button, button[type="button"], input[type="submit"]'
      );
      if (next) next.click();
      // Keep observing: Google SPA swaps to the password step in-place.
      return;
    }

    // Google SPA, password step.
    if (passwordInput && passwordValue && !passwordInput.value) {
      injectNativeValue(passwordInput, passwordValue);
      const submit = document.querySelector(
        '#passwordNext, #passwordNext button, #submit, button[type="submit"], input[type="submit"]'
      );
      if (submit) {
        submit.click();
        stopObservation(); // filled + submitted: stop observation to prevent leaks.
      }
    }
  };

  const begin = () => {
    getCredentials().then(({ username, password }) => {
      if (!username || !password) return; // no saved credentials -> clean exit.

      attemptFill({ username, password });

      // Fields not rendered yet -> observe DOM until the target inputs appear.
      if (!observer) {
        observer = new MutationObserver(() => attemptFill({ username, password }));
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    });
  };

  // document_start fires before the DOM exists; also retry once when it is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }
})();