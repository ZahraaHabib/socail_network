CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL REFERENCES users(id),
    user2_id INTEGER NOT NULL REFERENCES users(id),
    last_message_id INTEGER REFERENCES private_messages(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id),
    CHECK(user1_id < user2_id)
);
