/*
 * SRM Auto Login Ultra - Startup Auto-Login Worker
 * Opens the Google sign-in page (continue -> Gmail) once per browser
 * launch via chrome.runtime.onStartup. The content script then picks the
 * active session on Google's account chooser or runs the default password
 * flow; the `continue` parameter carries the user to Gmail afterwards.
 *
 * No extra permissions are required: chrome.tabs.create and onStartup are
 * available to an MV3 worker with only the "storage" permission.
 */
(() => {
  'use strict';

  const LOGIN_URL =
    'https://accounts.google.com/ServiceLogin' +
    '?continue=' +
    encodeURIComponent('https://mail.google.com/mail/u/0/') +
    '&service=mail';

  chrome.runtime.onStartup.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
      const alreadyOpen = (tabs || []).some(
        (t) => t.url && t.url.startsWith('https://accounts.google.com/')
      );
      if (alreadyOpen) return;
      chrome.tabs.create({ url: LOGIN_URL });
    });
  });
})();