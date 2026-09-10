CREATE TABLE aircraft_types (
  type_code TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  description TEXT,
  wake_category TEXT
);

CREATE TABLE aircraft_metadata (
  icao24 TEXT PRIMARY KEY CHECK (icao24 ~ '^[a-f0-9]{6}$'),
  registration TEXT,
  type_code TEXT,
  model TEXT,
  operator TEXT
);
CREATE INDEX aircraft_metadata_type_idx ON aircraft_metadata(type_code);

CREATE TABLE aircraft_catalog_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TIMESTAMPTZ NOT NULL,
  aircraft_count INTEGER NOT NULL,
  type_count INTEGER NOT NULL,
  source TEXT NOT NULL
);
