const { app, BrowserWindow, safeStorage } = require('electron');
const db = require('../database');
const intents = require('./intents');
const { buildSnapshot, hashSnapshot } = require('./snapshot');
const { DEFAULT_WORKER_URL } = require('../constants');
const { Rejection } = require('../rejection');
const logger = require('../logger');

// The desktop side of the sync loop against the Worker in cloud/: pull the
// intents the Mini App recorded and apply them one by one through
// intents.apply(), acknowledge the batch, then push the snapshot when its
// content changed. One cycle at a time; a request that arrives mid-cycle runs
// another cycle right after. Every failure is kept in the status for the
// header indicator and retried quietly: offline is not an error the user has
// to deal with.

const PULL_LIMIT = 100;
const MAX_PAGES_PER_CYCLE = 10;
const TICK_MS = 60_000;
const AFTER_MUTATION_MS = 2_000;
const FOCUS_MIN_GAP_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_BASE_MS = 5_000;

const KEY = {
  url: 'worker_url',
  secret: 'device_secret',
  revision: 'snapshot_revision',
  hash: 'snapshot_hash',
  lastSyncAt: 'last_sync_at',
};

// # STATUS
//
// off:     no address or no secret saved
// idle:    the last cycle finished
// syncing: a cycle is running
// error:   the last cycle failed; the reason is for the user
// needsPairing: the cloud no longer knows our secret (paired again elsewhere,
//   or the account was closed from the bot); only a new code helps

let status = { state: 'off', lastSyncAt: null, error: null, needsPairing: false };

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

function setStatus(patch) {
  status = { ...status, ...patch };
  broadcast('sync:status', status);
}

function getStatus() {
  return status;
}

// # SETTINGS
//
// The secret is stored only as safeStorage ciphertext. On Linux without a
// keyring the OS backend is basic_text, which Electron refuses to use unless
// asked to; the alternative would be no sync at all on such a machine.

function ensureEncryption() {
  if (safeStorage.isEncryptionAvailable()) return;
  if (process.platform === 'linux') {
    safeStorage.setUsePlainTextEncryption(true);
    if (safeStorage.isEncryptionAvailable()) return;
  }
  throw new Error('Шифрування секрету недоступне на цьому комп’ютері');
}

function readSecret() {
  const stored = db.getSyncState(KEY.secret);
  if (!stored) return null;
  ensureEncryption();
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    throw new Error('Секрет пристрою не вдалося розшифрувати, підключіть комп’ютер заново');
  }
}

function getSettings() {
  return { hasSecret: db.getSyncState(KEY.secret) != null };
}

/**
 * Trades the six digits the bot answered /connect with for this desktop's
 * secret. A wrong or expired code is a Rejection; the secret is stored and
 * the first cycle starts right away.
 */
async function pair(code) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length !== 6) throw new Rejection('Код має шість цифр');
  ensureEncryption();
  let response;
  try {
    response = await fetch(`${DEFAULT_WORKER_URL}/device/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: digits }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(describe(error));
  }
  if (response.status === 403) {
    throw new Rejection('Код невірний або прострочений. Надішліть боту /connect ще раз');
  }
  if (response.status === 429) {
    throw new Rejection('Забагато спроб. Зачекайте хвилину і спробуйте ще раз');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.secret !== 'string') {
    throw new Error(`Сервер відповів ${response.status}: ${body?.error ?? response.statusText}`);
  }
  db.setSyncState(KEY.secret, safeStorage.encryptString(body.secret).toString('base64'));
  db.setSyncState(KEY.url, DEFAULT_WORKER_URL);
  // A new or re-paired account has no snapshot of ours yet: the next cycle must push.
  // The revision stays; a 409 teaches us the cloud's counter if it is ahead.
  db.setSyncState(KEY.hash, null);
  setStatus({ state: 'idle', error: null, needsPairing: false });
  void sync();
  return getSettings();
}

function disable() {
  db.setSyncState(KEY.url, null);
  db.setSyncState(KEY.secret, null);
  setStatus({ state: 'off', error: null, needsPairing: false });
  return getSettings();
}

function readConfig() {
  const url = db.getSyncState(KEY.url);
  if (!url || db.getSyncState(KEY.secret) == null) return null;
  return { url, secret: readSecret() };
}

// # HTTP

function describe(error) {
  if (error.name === 'TimeoutError') return 'Сервер не відповідає';
  if (error.message === 'fetch failed') return 'Немає з’єднання з сервером';
  return error.message;
}

async function request(config, method, path, body) {
  const response = await fetch(config.url + path, {
    method,
    headers: {
      authorization: `Bearer ${config.secret}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok || response.status === 409) return { status: response.status, body: json };
  if (response.status === 401) {
    const error = new Error(
      'Комп’ютер від’єднано від хмари, підключіть його заново кодом від бота',
    );
    error.needsPairing = true;
    throw error;
  }
  if (response.status === 404) throw new Error('Сервер не знайдено за цією адресою');
  throw new Error(`Сервер відповів ${response.status}: ${json?.error ?? response.statusText}`);
}

// # PULL

// What the phone did, kept for the renderer until it asks: a window that is
// still loading would miss a broadcast, and the intents applied on start are
// exactly the ones the tutor forgot about.
let unseenChanges = [];

function takeChanges() {
  const changes = unseenChanges;
  unseenChanges = [];
  return changes;
}

/** The cloud knows applied and failed; a repeat answers with what was decided the first time. */
function toAck(id, outcome) {
  switch (outcome.status) {
    case 'applied':
      return { id, status: 'applied' };
    case 'duplicate':
      return outcome.previous.status === 'applied'
        ? { id, status: 'applied' }
        : { id, status: 'failed', reason: outcome.previous.reason };
    default:
      return { id, status: 'failed', reason: outcome.reason };
  }
}

/** @returns {number} how many intents were decided on this time, applied or refused */
async function pullAndApply(config) {
  let applied = 0;
  let decided = 0;
  for (let page = 0; page < MAX_PAGES_PER_CYCLE; page++) {
    const { body } = await request(config, 'GET', `/device/intents?limit=${PULL_LIMIT}`);
    const list = Array.isArray(body?.intents) ? body.intents : [];
    if (list.length === 0) break;
    const results = list.map((intent) => {
      const outcome = intents.apply(intent);
      if (outcome.status === 'applied') applied++;
      if (outcome.status === 'applied' || outcome.status === 'rejected') {
        decided++;
        unseenChanges.push({
          status: outcome.status,
          // A malformed payload is refused before it is described
          summary: outcome.summary ?? intent.type,
          reason: outcome.reason ?? null,
          createdAt: intent.createdAt,
        });
      }
      return toAck(intent.id, outcome);
    });
    await request(config, 'POST', '/device/intents/ack', { results });
    logger.info('Intents pulled', { received: list.length, applied });
    if (list.length < PULL_LIMIT) break;
  }
  return decided;
}

// # PUSH

async function pushSnapshot(config) {
  const snapshot = buildSnapshot();
  const hash = hashSnapshot(snapshot);
  if (hash === db.getSyncState(KEY.hash)) return false;

  let revision = Number(db.getSyncState(KEY.revision) ?? 0) + 1;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { status: code, body } = await request(config, 'POST', '/device/snapshot', {
      revision,
      ...snapshot,
    });
    if (code === 409) {
      // The cloud is ahead (a reinstall, another copy): continue from its counter.
      revision = Number(body?.revision ?? revision) + 1;
      continue;
    }
    db.setSyncState(KEY.revision, revision);
    db.setSyncState(KEY.hash, hash);
    logger.info('Snapshot pushed', { revision });
    return true;
  }
  throw new Error('Хмара не прийняла знімок');
}

// # CYCLE

let running = null;
let again = false;
let failures = 0;
let lastAttemptAt = 0;
let dirtyTimer = null;
let retryTimer = null;

async function runCycle() {
  lastAttemptAt = Date.now();
  let config;
  try {
    config = readConfig();
  } catch (error) {
    setStatus({ state: 'error', error: error.message });
    return;
  }
  if (!config) {
    setStatus({ state: 'off', error: null, needsPairing: false });
    return;
  }
  setStatus({ state: 'syncing' });
  try {
    const decided = await pullAndApply(config);
    if (decided > 0) broadcast('sync:changed', { decided });
    await pushSnapshot(config);
    failures = 0;
    const lastSyncAt = new Date().toISOString();
    db.setSyncState(KEY.lastSyncAt, lastSyncAt);
    setStatus({ state: 'idle', lastSyncAt, error: null, needsPairing: false });
  } catch (error) {
    failures++;
    logger.warn('Sync failed', { error: error.message, failures });
    setStatus({ state: 'error', error: describe(error), needsPairing: !!error.needsPairing });
    scheduleRetry();
  }
}

/** Runs a cycle, or queues one behind the cycle in flight; resolves with the status after. */
function sync() {
  if (running) {
    again = true;
  } else {
    running = (async () => {
      do {
        again = false;
        await runCycle();
      } while (again);
    })().finally(() => {
      running = null;
    });
  }
  return running.then(getStatus);
}

/** Growing pause after a failure; beyond a minute the regular tick takes over. */
function scheduleRetry() {
  const delay = RETRY_BASE_MS * 2 ** (failures - 1);
  if (delay >= TICK_MS || retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void sync();
  }, delay).unref();
}

/** A local mutation happened: push soon, once the burst of changes settles. */
function markDirty() {
  if (dirtyTimer) return;
  dirtyTimer = setTimeout(() => {
    dirtyTimer = null;
    void sync();
  }, AFTER_MUTATION_MS).unref();
}

function onFocus() {
  if (Date.now() - lastAttemptAt < FOCUS_MIN_GAP_MS) return;
  void sync();
}

function start() {
  status = {
    state: db.getSyncState(KEY.url) && getSettings().hasSecret ? 'idle' : 'off',
    lastSyncAt: db.getSyncState(KEY.lastSyncAt),
    error: null,
    needsPairing: false,
  };
  setInterval(() => void sync(), TICK_MS).unref();
  app.on('browser-window-focus', onFocus);
  void sync();
}

module.exports = { start, sync, markDirty, getStatus, getSettings, pair, disable, takeChanges };
