-- One Worker for every tutor: a desktop is an account, a Telegram user belongs
-- to one account. The cloud is not the source of truth, so the single-tutor
-- tables are recreated empty: the desktop pushes its snapshot again after
-- pairing, and the decided intents live in applied_intents on the desktop.
DROP TABLE snapshot;
DROP TABLE device;
DROP TABLE intents;

-- The desktop's Bearer is the secret the Worker generated when the account was
-- paired; only its SHA-256 is kept. Pairing again replaces it: one desktop per account.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  secret_hash TEXT NOT NULL UNIQUE,
  paired_at TEXT NOT NULL
);

-- The owner paired the desktop; members were invited by the owner and see the same.
CREATE TABLE account_members (
  tg_user_id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  first_name TEXT,
  joined_at TEXT NOT NULL
);

CREATE INDEX account_members_account_id ON account_members (account_id);

-- Six digits the bot hands out: a pair code types into the desktop, an invite
-- code joins a phone. One live code per user and kind; account_id is null for
-- a pair code of a user who has no account yet.
CREATE TABLE codes (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pair', 'invite')),
  tg_user_id INTEGER NOT NULL,
  account_id INTEGER REFERENCES accounts (id) ON DELETE CASCADE,
  first_name TEXT,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX codes_user_kind ON codes (tg_user_id, kind);

CREATE TABLE snapshot (
  account_id INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE device (
  account_id INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  seen_at TEXT NOT NULL
);

CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  tg_user_id INTEGER NOT NULL,
  first_name TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  reason TEXT,
  acked_at TEXT
);

CREATE INDEX intents_account_status_created_at ON intents (account_id, status, created_at);
