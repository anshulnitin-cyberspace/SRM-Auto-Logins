/* SRM Swift Sign-In - Multi-Account Storage Controller */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const srmIdInput = $('srmId');
  const pwInput = $('pwInput');
  const togglePw = $('togglePw');
  const saveBtn = $('saveBtn');
  const status = $('status');
  const accountsSection = $('accountsSection');
  const accountList = $('accountList');
  const accountsToggle = $('accountsToggle');

  let accounts = [];
  let activeAccountId = '';
  let editingId = '';
  let statusTimer = null;
  let accountsOpen = false;

  const showStatus = (message, kind = 'ok') => {
    status.textContent = message;
    status.className = kind;
    status.style.opacity = '1';
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.style.opacity = '0';
      statusTimer = null;
    }, 1500);
  };

  const relativeTime = (iso) => {
    if (!iso) return '';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const makeBtn = (label, onClick, extraClass = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = `acc-btn ${extraClass}`.trim();
    b.addEventListener('click', onClick);
    return b;
  };

  const render = () => {
    accountList.textContent = '';
    accountsSection.hidden = accounts.length === 0;
    if (!accounts.length) return;

    accounts.forEach((account) => {
      const row = document.createElement('div');
      row.className = 'acc-row';

      const email = document.createElement('span');
      email.className = 'acc-email';
      email.textContent = account.email.replace('@srmist.edu.in', '');
      email.title = account.email;

      const meta = document.createElement('span');
      meta.className = 'acc-meta';
      const parts = [
        account.enabled ? 'On' : 'Off',
        account.id === activeAccountId ? 'Default' : '',
        account.lastUsed ? relativeTime(account.lastUsed) : ''
      ].filter(Boolean);
      meta.textContent = parts.join(' · ');

      const actions = document.createElement('span');
      actions.className = 'acc-actions';
      actions.append(
        makeBtn(account.id === activeAccountId ? 'Default' : 'Set default', () => {
          activeAccountId = account.id;
          persist().then(render);
        }),
        makeBtn(account.enabled ? 'Disable' : 'Enable', async () => {
          account.enabled = !account.enabled;
          account.updatedAt = new Date().toISOString();
          await persist();
          render();
        }),
        makeBtn('Edit', () => {
          editingId = account.id;
          srmIdInput.value = normalizeSrmId(account.email);
          pwInput.value = '';
          pwInput.placeholder = '(unchanged - type to update)';
          pwInput.type = 'password';
          togglePw.textContent = 'Show';
          saveBtn.textContent = 'Update account';
          showStatus('');
          srmIdInput.focus();
        }),
        makeBtn(
          'Delete',
          async () => {
            accounts = accounts.filter((a) => a.id !== account.id);
            if (activeAccountId === account.id) {
              activeAccountId = accounts.length ? accounts[0].id : '';
            }
            if (editingId === account.id) resetForm();
            await persist();
            render();
          },
          'danger'
        )
      );

      row.append(email, meta, actions);
      accountList.append(row);
    });
  };

  const persist = () => saveAccounts(accounts, activeAccountId);

  const resetForm = () => {
    editingId = '';
    srmIdInput.value = '';
    pwInput.value = '';
    pwInput.placeholder = '';
    pwInput.type = 'password';
    togglePw.textContent = 'Show';
    saveBtn.textContent = 'Save account';
  };

  const load = async () => {
    const data = await loadAccounts();
    accounts = data.accounts;
    activeAccountId = data.activeAccountId;
    render();
  };

  saveBtn.addEventListener('click', async () => {
    const id = normalizeSrmId(srmIdInput.value);
    if (!isValidSrmId(id)) {
      showStatus('Use the SRM ID format: ab1234', 'err');
      return;
    }
    const typed = pwInput.value.trim();
    const editing = accounts.find((a) => a.id === editingId);

    let password;
    if (typed) {
      password = _encode(typed);
    } else if (editing) {
      password = editing.password;
    } else {
      showStatus('Enter a password.', 'err');
      return;
    }

    const email = `${id}@srmist.edu.in`;
    const existing = accounts.find((a) => a.email === email && a.id !== editingId);
    const source = editing || existing || null;
    const now = new Date().toISOString();
    const account = {
      id: source ? source.id : genId(),
      email,
      password,
      enabled: source ? source.enabled !== false : true,
      createdAt: source ? source.createdAt : now,
      updatedAt: now
    };

    accounts = accounts.filter((a) => a.id !== account.id && a.email !== email);
    accounts.push(account);
    if (!activeAccountId) activeAccountId = account.id;

    await persist();
    resetForm();
    render();
    showStatus('Saved!');
  });

  togglePw.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    togglePw.textContent = showing ? 'Show' : 'Hide';
  });

  srmIdInput.addEventListener('input', () => {
    const cleaned = normalizeSrmId(srmIdInput.value)
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 6);
    if (srmIdInput.value !== cleaned) srmIdInput.value = cleaned;
  });

  accountsToggle.addEventListener('click', () => {
    accountsOpen = !accountsOpen;
    accountList.hidden = !accountsOpen;
    accountsToggle.setAttribute('aria-expanded', String(accountsOpen));
  });

  load();
})();