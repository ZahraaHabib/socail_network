package database

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

var DB *sql.DB

// InitDB initializes the database connection and creates tables if they don't exist.
func InitDB(dataSourceName string) error {
	var err error
	// Open the SQLite database file
	DB, err = sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Check if the connection is successful
	err = DB.Ping()
	if err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Successfully connected to the database!")

	// SQL statements to create tables (SQLite compatible)
	createTablesSQL := `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        first_name TEXT,
        last_name TEXT,
        avatar TEXT, 
        about_me TEXT,
        is_private BOOLEAN DEFAULT FALSE,
        nickname TEXT,
        date_of_birth TEXT 
    );

    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        image_path TEXT,
        privacy INTEGER DEFAULT 0, -- 0: public, 1: followers_only, 2: close_friends
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS close_friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        close_friend_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (close_friend_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, close_friend_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES posts(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER REFERENCES posts(id),
        comment_id INTEGER REFERENCES comments(id), -- Added for comment likes
        user_id INTEGER NOT NULL REFERENCES users(id),
        is_like BOOLEAN DEFAULT TRUE, -- TRUE for like, FALSE for dislike
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id),
        UNIQUE(user_id, comment_id), -- Ensure user can like a comment only once
        CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL) -- Ensure like is for a post or a comment
    );

    CREATE TABLE IF NOT EXISTS followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_id INTEGER NOT NULL,                           -- User who initiates the follow
        followed_id INTEGER NOT NULL,                           -- User who is being followed
        status TEXT NOT NULL CHECK(status IN ('pending', 'accept')) DEFAULT 'pending', -- 'pending', 'accept'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,          -- For when status changes
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(follower_id, followed_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        role TEXT NOT NULL DEFAULT 'member', -- 'member' or 'creator'
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'invited', 'requested')) DEFAULT 'pending',
        invited_by INTEGER REFERENCES users(id),
        requested_at DATETIME,
        invited_at DATETIME,
        accepted_at DATETIME,
        UNIQUE(group_id, user_id)
    );

        CREATE TABLE IF NOT EXISTS group_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES groups(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_post_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES group_posts(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE IF NOT EXISTS group_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    creator_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    event_time DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_event_rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES group_events(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    response TEXT NOT NULL CHECK(response IN ('going', 'not going')),
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS private_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL REFERENCES users(id),
    user2_id INTEGER NOT NULL REFERENCES users(id),
    last_message_id INTEGER REFERENCES private_messages(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id),
    CHECK(user1_id < user2_id) -- Ensure consistent ordering
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER,
    related_type TEXT,
    actor_id INTEGER REFERENCES users(id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
    
    `

	_, err = DB.Exec(createTablesSQL)
	if err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	// Run migrations for existing databases
	err = runMigrations()
	if err != nil {
		log.Printf("Migration warning: %v", err)
		// Don't fail on migration errors, as columns might already exist
	}

	log.Println("Database tables checked/created successfully.")
	return nil
}

// runMigrations adds missing columns to existing tables
func runMigrations() error {
	migrations := []string{
		`ALTER TABLE users ADD COLUMN first_name TEXT`,
		`ALTER TABLE users ADD COLUMN last_name TEXT`,
		`ALTER TABLE users ADD COLUMN avatar TEXT`,
		`ALTER TABLE users ADD COLUMN about_me TEXT`,
		`ALTER TABLE users ADD COLUMN is_private BOOLEAN DEFAULT FALSE`,
		`ALTER TABLE users ADD COLUMN nickname TEXT`,
		`ALTER TABLE users ADD COLUMN date_of_birth TEXT`,
		`ALTER TABLE posts ADD COLUMN image_path TEXT`,
		`ALTER TABLE posts ADD COLUMN privacy INTEGER DEFAULT 0`,
		`ALTER TABLE likes ADD COLUMN is_like BOOLEAN DEFAULT TRUE`,
	}

	for _, migration := range migrations {
		_, err := DB.Exec(migration)
		if err != nil {
			// Column might already exist, log but continue
			log.Printf("Migration info: %s (this is normal if column already exists)", err.Error())
		}
	}

	return nil
}
