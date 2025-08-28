package api

import (
	"encoding/json"
	"net/http"

	"reda-social-network/database"
	"reda-social-network/middleware"
)

// GET /users/available-for-invite - get users that can be invited
func GetAvailableUsersHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	type User struct {
		ID       int64  `json:"id"`
		Username string `json:"username"`
		Avatar   string `json:"avatar,omitempty"`
	}

	// Get all users except the current user
	rows, err := database.DB.Query(`
		SELECT id, username, COALESCE(avatar, '') as avatar
		FROM users 
		WHERE id != ?
		ORDER BY username ASC
	`, userID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Avatar); err != nil {
			continue
		}
		users = append(users, u)
	}
	if users == nil {
		users = []User{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// GET /whoami - simple endpoint to check current user ID
func WhoAmIHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      userID,
		"message": "You are logged in",
	})
}
