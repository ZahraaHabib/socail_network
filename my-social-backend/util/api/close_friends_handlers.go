package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"reda-social-network/database"
	"reda-social-network/models"
	"reda-social-network/util"
)

// AddCloseFriendHandler adds a user to close friends list
// POST /close-friends
func AddCloseFriendHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := util.GetUserIDFromRequest(r)
	if err != nil || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req models.CloseFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON data", http.StatusBadRequest)
		return
	}

	if req.TargetUserID == userID {
		http.Error(w, "Cannot add yourself to close friends", http.StatusBadRequest)
		return
	}

	// Check if target user exists and if current user follows them
	var exists bool
	var isFollowing bool
	err = database.DB.QueryRow(`
		SELECT 
			EXISTS(SELECT 1 FROM users WHERE id = ?),
			EXISTS(SELECT 1 FROM followers WHERE follower_id = ? AND followed_id = ? AND status = 'accept')
	`, req.TargetUserID, userID, req.TargetUserID).Scan(&exists, &isFollowing)

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if !exists {
		http.Error(w, "Target user not found", http.StatusNotFound)
		return
	}

	if !isFollowing {
		http.Error(w, "You must be following this user to add them to close friends", http.StatusBadRequest)
		return
	}

	// Check if already in close friends
	var alreadyCloseFriend bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM close_friends WHERE user_id = ? AND close_friend_id = ?)",
		userID, req.TargetUserID).Scan(&alreadyCloseFriend)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if alreadyCloseFriend {
		http.Error(w, "User is already in your close friends list", http.StatusConflict)
		return
	}

	// Add to close friends
	_, err = database.DB.Exec(`
		INSERT INTO close_friends (user_id, close_friend_id, created_at) 
		VALUES (?, ?, ?)
	`, userID, req.TargetUserID, time.Now())

	if err != nil {
		log.Printf("Error adding close friend: %v", err)
		http.Error(w, "Failed to add close friend", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Added to close friends successfully"})
}

// RemoveCloseFriendHandler removes a user from close friends list
// DELETE /close-friends/{targetUserID}
func RemoveCloseFriendHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := util.GetUserIDFromRequest(r)
	if err != nil || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetUserIDStr := r.PathValue("targetUserID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid target user ID", http.StatusBadRequest)
		return
	}

	result, err := database.DB.Exec("DELETE FROM close_friends WHERE user_id = ? AND close_friend_id = ?",
		userID, targetUserID)
	if err != nil {
		log.Printf("Error removing close friend: %v", err)
		http.Error(w, "Failed to remove close friend", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "User was not in your close friends list", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Removed from close friends successfully"})
}

// GetCloseFriendsHandler gets the user's close friends list
// GET /close-friends
func GetCloseFriendsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := util.GetUserIDFromRequest(r)
	if err != nil || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
		SELECT u.id, u.username, 
			   COALESCE(u.first_name, '') as first_name,
			   COALESCE(u.last_name, '') as last_name,
			   COALESCE(u.avatar, '') as avatar
		FROM close_friends cf
		JOIN users u ON cf.close_friend_id = u.id
		WHERE cf.user_id = ?
		ORDER BY u.username
	`

	rows, err := database.DB.Query(query, userID)
	if err != nil {
		log.Printf("Error fetching close friends: %v", err)
		http.Error(w, "Failed to fetch close friends", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var closeFriends []models.CloseFriendResponse
	for rows.Next() {
		var friend models.CloseFriendResponse
		err := rows.Scan(&friend.ID, &friend.Username, &friend.FirstName, &friend.LastName, &friend.Avatar)
		if err != nil {
			log.Printf("Error scanning close friend: %v", err)
			continue
		}
		friend.IsCloseFriend = true
		closeFriends = append(closeFriends, friend)
	}

	if closeFriends == nil {
		closeFriends = []models.CloseFriendResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(closeFriends)
}

// CheckCloseFriendHandler checks if a user is in close friends list
// GET /close-friends/check/{targetUserID}
func CheckCloseFriendHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := util.GetUserIDFromRequest(r)
	if err != nil || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetUserIDStr := r.PathValue("targetUserID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid target user ID", http.StatusBadRequest)
		return
	}

	var isCloseFriend bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM close_friends WHERE user_id = ? AND close_friend_id = ?)",
		userID, targetUserID).Scan(&isCloseFriend)
	if err != nil {
		log.Printf("Error checking close friend status: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"is_close_friend": isCloseFriend})
}
