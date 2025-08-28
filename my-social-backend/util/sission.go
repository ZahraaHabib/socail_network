package util

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"

	// Replace 'your_module_name' with your actual module name
	"reda-social-network/database" // For looking up user details if needed, though not strictly for session ID
)

const SessionCookieName = "session_token"

// SessionStore holds active sessions.
// For simplicity, we're using an in-memory store.
// The workspace project also uses an in-memory map: util.UserSession in server/util/session.go
var (
	sessions = make(map[string]int64) // Maps session token to UserID
	mu       sync.RWMutex
)

// GenerateSessionToken creates a cryptographically secure random session token.
func GenerateSessionToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// CreateSession creates a new session for the user and returns the session token.
func CreateSession(userID int64) (string, error) {
	token, err := GenerateSessionToken()
	if err != nil {
		return "", err
	}

	mu.Lock()
	sessions[token] = userID
	mu.Unlock()
	return token, nil
}

// GetUserIDFromSession retrieves the UserID associated with a session token.
// Returns 0 if the session is not valid.
func GetUserIDFromSession(token string) int64 {
	mu.RLock()
	userID, ok := sessions[token]
	mu.RUnlock()
	if !ok {
		return 0 // Or an error indicating session not found
	}
	return userID
}

// DeleteSession removes a session from the store.
func DeleteSession(token string) {
	mu.Lock()
	delete(sessions, token)
	mu.Unlock()
}

// GetUserIDFromRequest extracts the UserID from the session cookie in an HTTP request.
// This is similar to util.GetUserID in server/util/session.go
func GetUserIDFromRequest(r *http.Request) (int64, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		if err == http.ErrNoCookie {
			return 0, nil // No session cookie, not necessarily an error here, middleware handles auth
		}
		return 0, err // Other error reading cookie
	}

	userID := GetUserIDFromSession(cookie.Value)
	if userID == 0 {
		// Invalid or expired token
		return 0, nil // Let middleware handle this as unauthorized
	}

	// Optional: Check if user still exists in DB
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", userID).Scan(&exists)
	if err != nil || !exists {
		DeleteSession(cookie.Value) // Clean up invalid session
		return 0, nil               // User deleted or DB error
	}

	return userID, nil
}
