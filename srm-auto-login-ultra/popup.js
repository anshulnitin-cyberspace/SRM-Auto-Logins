/* SRM Auto Login Ultra - Storage Controller */
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    let statusTimer = null;

    // Pre-fill saved values if they exist.
    chrome.storage.local.get(['username', 'password'], (items) => {
      if (items.username) usernameInput.value = items.username;
      if (items.password) passwordInput.value = items.password;
    });

    const showStatus = (message, color) => {
      status.textContent = message;
      status.style.color = color || '#1a7f37';
      status.style.opacity = '1';
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        status.style.opacity = '0';
        statusTimer = null;
      }, 1500);
    };

    saveBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) {
        showStatus('Please fill in both fields.', '#d1242f');
        return;
      }
      chrome.storage.local.set({ username, password }, () => {
        showStatus('Saved!');
      });
    });
  });
})();