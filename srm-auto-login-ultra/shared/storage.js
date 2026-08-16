/* SRM Auto Login Ultra - Shared Storage Layer
 * Loaded before content.js and popup.js. Single source of truth for
 * credential encoding, normalization, and chrome.storage.local access.
 */
const browserApi = globalThis.browser || globalThis.chrome;

const SRM_SALT = 'srm-al-obf-v2';

function _encode(str) {
  const salt = new TextEncoder().encode(SRM_SALT);
  const plain = new TextEncoder().encode(str);
  const out = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) {
    out[i] = plain[i] ^ salt[i % salt.length];
  }
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

function _decode(hex) {
  if (!hex || typeof hex !== 'string') return '';
  const salt = new TextEncoder().encode(SRM_SALT);
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16) ^ salt[(i >> 1) % salt.length]);
  }
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch (_) {
    return '';
  }
}

function looksObfuscated(str) {
  return (
    typeof str === 'string' &&
    str.length > 0 &&
    str.length % 2 === 0 &&
    /^[0-9a-f]+$/.test(str)
  );
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function normalizeSrmId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/@srmist\.edu\.in$/i, '');
}

function isValidSrmId(value) {
  return /^[a-z]{2}[0-9]{4}$/.test(normalizeSrmId(value));
}

function toSrmEmail(value) {
  return `${normalizeSrmId(value)}@srmist.edu.in`;
}

function genId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAccount(account) {
  if (!account || !account.email || !account.password) return null;
  return {
    ...account,
    email: normalizeEmail(account.email),
    password: looksObfuscated(account.password)
      ? account.password
      : _encode(account.password),
    enabled: account.enabled !== false
  };
}

/* Read accounts; migrate the legacy single-account (username/password)
 * format into the srm_accounts array on first run. */
async function loadAccounts() {
  const data = await browserApi.storage.local.get([
    'srm_accounts',
    'srm_active_account_id',
    'username',
    'password'
  ]);

  let accounts = Array.isArray(data.srm_accounts)
    ? data.srm_accounts.map(normalizeAccount).filter(Boolean)
    : [];
  let activeAccountId = data.srm_active_account_id || '';

  if (!accounts.length && data.username && data.password) {
    const email = data.username.includes('@')
      ? normalizeEmail(data.username)
      : `${normalizeSrmId(data.username)}@srmist.edu.in`;
    const migrated = normalizeAccount({
      id: genId(),
      email,
      password: data.password,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (migrated) {
      accounts = [migrated];
      activeAccountId = migrated.id;
    }
    await browserApi.storage.local.remove(['username', 'password']);
    await browserApi.storage.local.set({
      srm_accounts: accounts,
      srm_active_account_id: activeAccountId
    });
  }

  if (!accounts.some((a) => a.id === activeAccountId)) {
    activeAccountId = accounts.length ? accounts[0].id : '';
  }
  return { accounts, activeAccountId };
}

async function saveAccounts(accounts, activeAccountId) {
  await browserApi.storage.local.set({
    srm_accounts: accounts,
    srm_active_account_id: activeAccountId || ''
  });
}