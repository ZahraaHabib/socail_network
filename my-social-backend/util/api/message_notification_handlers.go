package api

import (
	"encoding/json"
	"log"
	"net/http"

	"reda-social-network/database"
	"reda-social-network/middleware"
)

// GetUnreadMessagesCountHandler returns the total count of unread direct messages for a user
func GetUnreadMessagesCountHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var totalUnreadCount int
	err := database.DB.QueryRow(`
		SELECT COUNT(*) FROM private_messages WHERE receiver_id = ? AND is_read = FALSE
	`, userID).Scan(&totalUnreadCount)
	if err != nil {
		log.Printf("Error getting total unread messages count for user %d: %v", userID, err)
		http.Error(w, "Failed to fetch unread messages count", http.StatusInternalServerError)
		return
	}

	response := map[string]int{"unread_count": totalUnreadCount}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetUnreadMessagesHandler returns all unread direct messages for the authenticated user
func GetUnreadMessagesHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := database.DB.Query(`
		SELECT pm.id, pm.sender_id, u.username, pm.content, pm.created_at
		FROM private_messages pm
		JOIN users u ON pm.sender_id = u.id
		WHERE pm.receiver_id = ? AND pm.is_read = FALSE
		ORDER BY pm.created_at DESC
	`, userID)
	if err != nil {
		log.Printf("Error fetching unread messages for user %d: %v", userID, err)
		http.Error(w, "Failed to fetch unread messages", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var id, senderID int
		var username, content string
		var createdAt string
		if err := rows.Scan(&id, &senderID, &username, &content, &createdAt); err != nil {
			log.Printf("Error scanning unread message row: %v", err)
			continue
		}
		messages = append(messages, map[string]interface{}{
			"id": id,
			"sender_id": senderID,
			"username": username,
			"content": content,
			"created_at": createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
