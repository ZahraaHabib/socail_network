CREATE TABLE IF NOT EXISTS close_friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    close_friend_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (close_friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, close_friend_id)
);
