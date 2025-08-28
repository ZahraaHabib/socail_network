CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'invited', 'requested')) DEFAULT 'pending',
    invited_by INTEGER REFERENCES users(id),
    requested_at DATETIME,
    invited_at DATETIME,
    accepted_at DATETIME,
    UNIQUE(group_id, user_id)
);
