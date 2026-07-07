-- 061_celebration_messages.sql
-- Virtual birthday / anniversary card system.
-- Each employee can receive one message per author per occasion per year.
-- Any authenticated user can read messages; only the author can insert/delete.

CREATE TABLE IF NOT EXISTS celebration_messages (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  occasion    TEXT        NOT NULL CHECK (occasion IN ('birthday', 'anniversary')),
  year        INT         NOT NULL,
  message     TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, author_id, occasion, year)
);

CREATE INDEX IF NOT EXISTS idx_celebration_messages_emp_occasion
  ON celebration_messages(employee_id, occasion, year);

ALTER TABLE celebration_messages ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read celebration messages (it's a celebration!)
CREATE POLICY "Authenticated users can read" ON celebration_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Authors can only insert messages attributed to themselves
CREATE POLICY "Insert own message" ON celebration_messages
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Authors can update their own message (to allow edits within the year)
CREATE POLICY "Update own message" ON celebration_messages
  FOR UPDATE USING (auth.uid() = author_id);

-- Authors can remove their own message
CREATE POLICY "Delete own message" ON celebration_messages
  FOR DELETE USING (auth.uid() = author_id);
