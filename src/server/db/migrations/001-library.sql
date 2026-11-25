CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  age INTEGER,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 8),
  voice_on INTEGER NOT NULL CHECK (voice_on IN (0, 1)),
  sound_on INTEGER NOT NULL CHECK (sound_on IN (0, 1)),
  try_again_on INTEGER NOT NULL CHECK (try_again_on IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 8),
  kid_color TEXT NOT NULL CHECK (kid_color IN ('w', 'b')),
  status TEXT NOT NULL CHECK (status IN ('active', 'finished', 'aborted')),
  result TEXT CHECK (result IN ('win', 'loss', 'draw')),
  termination TEXT,
  pgn TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  stars INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX games_one_active ON games(profile_id) WHERE status = 'active';
CREATE INDEX games_profile ON games(profile_id);

CREATE TABLE badges (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  PRIMARY KEY (profile_id, badge_id)
);

CREATE TABLE level_suggestions (
  id INTEGER PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  created_at TEXT NOT NULL,
  response TEXT CHECK (response IN ('accepted', 'declined')),
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX suggestions_one_pending
  ON level_suggestions(profile_id) WHERE response IS NULL;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
