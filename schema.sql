-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  level TEXT,
  learning_goal TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Topic sessions (one per user per topic)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  readiness_score INT DEFAULT 0,
  syllabus_topics JSONB DEFAULT '[]',
  covered_topics JSONB DEFAULT '[]',
  pending_topics JSONB DEFAULT '[]',
  key_concepts JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, topic_slug)
);

-- Q&A cards
CREATE TABLE IF NOT EXISTS qa_cards (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags JSONB DEFAULT '[]',
  attempts JSONB DEFAULT '[]',
  wrong_count INT DEFAULT 0,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Score history
CREATE TABLE IF NOT EXISTS score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL,
  date DATE NOT NULL,
  score INT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weak areas
CREATE TABLE IF NOT EXISTS weak_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL,
  sub_topic TEXT,
  description TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  question_id TEXT,
  question TEXT,
  wrong_count INT DEFAULT 0,
  flagged_for_review BOOLEAN DEFAULT false,
  UNIQUE(user_id, topic_slug, sub_topic)
);
