-- One row: the latest snapshot the desktop pushed, kept whole as JSON.
CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- Intents recorded by the Mini App, waiting for the desktop to apply them.
CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  tg_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  reason TEXT,
  acked_at TEXT
);

CREATE INDEX intents_status_created_at ON intents (status, created_at);
