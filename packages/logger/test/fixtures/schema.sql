-- Schema for logs table (from docs/architecture/logging.md)
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_level ON logs(level, timestamp);
