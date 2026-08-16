/*
 * SRM Auto Login Ultra - High-Performance Google Auth Engine
 * Event-driven, zero-polling auto-login for SRMIST Google accounts.
 * Runs at document_start, exits in <1ms on valid sessions, and rides
 * Google's SPA step transitions via MutationObserver (never setInterval).
 */
(async () => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * STEP 2.1: Immediate Fast-Exit Guard (sub-millisecond)
   * ------------------------------------------------------------------ */
  const CURRENT_URL = window.location.href;
  const LOGIN_PATH_MARKERS = ['/signin/', '/v3/signin/', '/ServiceLogin', '/InteractiveLogin'];

  // Non-login URL -> return before touching the DOM.
  if (!LOGIN_PATH_MARKERS.some((marker) => CURRENT_URL.includes(marker))) return;
  // Already an active Google session / signed-in chrome -> terminate immediately.
  if (document.querySelector('#gb, a[aria-label*="Google Account"]')) return;

  /* ------------------------------------------------------------------ *
   * STEP 2.2: Native Value Setter
   * Beats the prototype overrides Google's SPA applies to .value so the
   * framework actually observes the injected credentials.
   * ------------------------------------------------------------------ */
  const injectNativeValue = (element, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
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

  // Raw 6-char NetID ("ab1234") -> full SRM email; full emails kept as-is.
  const formatEmail = (username) =>
    username.includes('@') ? username : username + '@srmist.edu.in';

  /* ------------------------------------------------------------------ *
   * STEP 2.4: Google Auth SPA Step Machine
   * ------------------------------------------------------------------ */
  const EMAIL_SELECTOR = 'input[type="email"], #identifierId, input[name="identifier"]';
  const PASSWORD_SELECTOR =
    'input[type="password"], input[name="password"], input[name="Passwd"]';

  let observer = null;
  let submitted = false;

  const stopObservation = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  const attemptFill = ({ username, password }) => {
    // Signed-in chrome appeared without any login form -> stop watching.
    if (document.querySelector('#gb, a[aria-label*="Google Account"]')) {
      stopObservation();
      submitted = true;
      return;
    }

    const emailInput = document.querySelector(EMAIL_SELECTOR);
    const passwordInput = document.querySelector(PASSWORD_SELECTOR);

    // PASSWORD STEP: fill and submit, then release the observer.
    if (passwordInput && password && !passwordInput.value) {
      injectNativeValue(passwordInput, password);
      const submit = document.querySelector('#passwordNext, button[type="button"]');
      if (submit) {
        submit.click();
        submitted = true;
      }
      stopObservation(); // final step completed -> free main-thread memory.
      return;
    }

    // EMAIL / IDENTIFIER STEP: fill, advance to the password step in-place.
    if (emailInput && username && !emailInput.value) {
      injectNativeValue(emailInput, formatEmail(username));
      const next = document.querySelector('#identifierNext, button[type="button"]');
      if (next) setTimeout(() => next.click(), 100); // micro-delay for SPA to register input.
    }
  };

  const begin = async () => {
    const { username, password } = await getCredentials();
    if (!username || !password) return; // no saved credentials -> clean exit.

    attemptFill({ username, password });

    // Target inputs not rendered yet -> watch for SPA step transitions.
    if (!submitted) {
      observer = new MutationObserver(() => attemptFill({ username, password }));
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  // document_start fires before the DOM exists; wait for it when needed.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }
})();