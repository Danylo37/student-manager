-- One row: when the desktop last pulled intents. The Mini App tells from it
-- whether the desktop is reachable, which the snapshot alone cannot say: an
-- unchanged snapshot is not pushed again.
CREATE TABLE device (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seen_at TEXT NOT NULL
);
