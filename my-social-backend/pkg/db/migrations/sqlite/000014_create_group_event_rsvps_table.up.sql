CREATE TABLE IF NOT EXISTS group_event_rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES group_events(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    response TEXT NOT NULL CHECK(response IN ('going', 'not going')),
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);
