package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/models"
)

// RequestFollowUserHandler handles a user's request to follow another user.
// POST /users/{targetUserID}/follow
func RequestFollowUserHandler(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || currentUserID == 0 {
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	targetUserIDStr := r.PathValue("targetUserID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid target user ID in URL path", http.StatusBadRequest)
		return
	}

	if currentUserID == targetUserID {
		http.Error(w, "Cannot follow yourself", http.StatusBadRequest)
		return
	}

	// Check if target user exists and get their privacy setting
	var targetUserExists bool
	var targetUserIsPrivate bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?), COALESCE(is_private, FALSE) FROM users WHERE id = ?", targetUserID, targetUserID).Scan(&targetUserExists, &targetUserIsPrivate)
	if err != nil {
		if err == sql.ErrNoRows { // Should be caught by EXISTS, but as a fallback
			http.Error(w, "Target user not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error checking target user: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !targetUserExists {
		http.Error(w, "Target user not found", http.StatusNotFound)
		return
	}

	// Check existing follow status
	var existingStatus sql.NullString
	err = database.DB.QueryRow("SELECT status FROM followers WHERE follower_id = ? AND followed_id = ?", currentUserID, targetUserID).Scan(&existingStatus)
	if err != nil && err != sql.ErrNoRows {
		http.Error(w, "Database error checking existing follow: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if existingStatus.Valid {
		if existingStatus.String == "accept" {
			http.Error(w, "Already following this user", http.StatusConflict)
			return
		}
		if existingStatus.String == "pending" {
			http.Error(w, "Follow request already pending", http.StatusConflict)
			return
		}
	}

	newStatus := "accept"
	if targetUserIsPrivate {
		newStatus = "pending"
	}

	now := time.Now()
	_, err = database.DB.Exec(`
        INSERT INTO followers (follower_id, followed_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(follower_id, followed_id) DO UPDATE SET
        status = excluded.status, updated_at = excluded.updated_at
    `, currentUserID, targetUserID, newStatus, now, now)
	if err != nil {
		http.Error(w, "Failed to process follow request: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error inserting/updating follow for follower %d to followed %d: %v", currentUserID, targetUserID, err)
		return
	}

	responseMessage := "Follow request sent and pending approval."
	switch newStatus {
	case "accept":
		responseMessage = "Successfully followed user."
		// Create notification for direct follow (when user is public)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error creating follow notification: %v", r)
				}
			}()
			NotificationHelper.CreateDirectFollowNotification(int(currentUserID), int(targetUserID))
		}()
	case "pending":
		// Create notification for follow request
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error creating follow request notification: %v", r)
				}
			}()
			NotificationHelper.CreateFollowRequestNotification(int(currentUserID), int(targetUserID))
		}()
	}

	// Log the follow action for debugging
	log.Printf("User %d requested to follow user %d with status: %s", currentUserID, targetUserID, newStatus)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.FollowStatusResponse{
		TargetUserID: targetUserID,
		Status:       newStatus,
		Message:      responseMessage,
	})
}

// UnfollowUserHandler handles a user's request to unfollow another user.
// DELETE /users/{targetUserID}/follow
func UnfollowUserHandler(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || currentUserID == 0 {
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	targetUserIDStr := r.PathValue("targetUserID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid target user ID in URL path", http.StatusBadRequest)
		return
	}

	// Check if target user exists (optional, but good practice)
	var targetUserExists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", targetUserID).Scan(&targetUserExists)
	if err != nil || !targetUserExists {
		http.Error(w, "Target user not found or DB error", http.StatusNotFound)
		return
	}

	result, err := database.DB.Exec("DELETE FROM followers WHERE follower_id = ? AND followed_id = ?", currentUserID, targetUserID)
	if err != nil {
		http.Error(w, "Failed to unfollow user: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error deleting follow for follower %d to followed %d: %v", currentUserID, targetUserID, err)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Not following this user or request not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.FollowStatusResponse{
		TargetUserID: targetUserID,
		Status:       "not_following",
		Message:      "Successfully unfollowed user.",
	})
}

// GetFollowersHandler retrieves a list of users following the target user.
// GET /users/{userID}/followers
func GetFollowersHandler(w http.ResponseWriter, r *http.Request) {
	targetUserIDStr := r.PathValue("userID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID in URL path", http.StatusBadRequest)
		return
	}

	query := `
        SELECT u.id, u.username, COALESCE(u.first_name, ''), COALESCE(u.last_name, ''), COALESCE(u.avatar, '')
        FROM users u
        JOIN followers f ON u.id = f.follower_id
        WHERE f.followed_id = ? AND f.status = 'accept'
        ORDER BY f.created_at DESC
    `
	rows, err := database.DB.Query(query, targetUserID)
	if err != nil {
		http.Error(w, "Database error fetching followers: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error querying followers for user %d: %v", targetUserID, err)
		return
	}
	defer rows.Close()

	var followers []models.UserFollowInfo
	for rows.Next() {
		var u models.UserFollowInfo
		if err := rows.Scan(&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Avatar); err != nil {
			log.Printf("Error scanning follower for user %d: %v", targetUserID, err)
			continue // Skip problematic row
		}
		followers = append(followers, u)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating follower rows: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if followers == nil {
		followers = []models.UserFollowInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(followers)
}

// GetFollowingHandler retrieves a list of users the target user is following.
// GET /users/{userID}/following
func GetFollowingHandler(w http.ResponseWriter, r *http.Request) {
	targetUserIDStr := r.PathValue("userID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID in URL path", http.StatusBadRequest)
		return
	}

	query := `
        SELECT u.id, u.username, COALESCE(u.first_name, ''), COALESCE(u.last_name, ''), COALESCE(u.avatar, '')
        FROM users u
        JOIN followers f ON u.id = f.followed_id
        WHERE f.follower_id = ? AND f.status = 'accept'
        ORDER BY f.created_at DESC
    `
	rows, err := database.DB.Query(query, targetUserID)
	if err != nil {
		http.Error(w, "Database error fetching following list: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error querying following for user %d: %v", targetUserID, err)
		return
	}
	defer rows.Close()

	var following []models.UserFollowInfo
	for rows.Next() {
		var u models.UserFollowInfo
		if err := rows.Scan(&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Avatar); err != nil {
			log.Printf("Error scanning following user for user %d: %v", targetUserID, err)
			continue
		}
		following = append(following, u)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating following rows: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if following == nil {
		following = []models.UserFollowInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(following)
}

// GetPendingFollowRequestsHandler retrieves pending follow requests for the authenticated user.
// GET /follow-requests
func GetPendingFollowRequestsHandler(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || currentUserID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
        SELECT u.id, u.username, COALESCE(u.first_name, ''), COALESCE(u.last_name, ''), COALESCE(u.avatar, '')
        FROM users u
        JOIN followers f ON u.id = f.follower_id
        WHERE f.followed_id = ? AND f.status = 'pending'
        ORDER BY f.created_at ASC
    `
	rows, err := database.DB.Query(query, currentUserID)
	if err != nil {
		http.Error(w, "Database error fetching pending requests: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error querying pending requests for user %d: %v", currentUserID, err)
		return
	}
	defer rows.Close()

	var requests []models.UserFollowInfo
	for rows.Next() {
		var u models.UserFollowInfo
		if err := rows.Scan(&u.ID, &u.Username, &u.FirstName, &u.LastName, &u.Avatar); err != nil {
			log.Printf("Error scanning pending request for user %d: %v", currentUserID, err)
			continue
		}
		requests = append(requests, u)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating pending request rows: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if requests == nil {
		requests = []models.UserFollowInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

// HandleFollowRequestHandler allows the authenticated user to accept or reject a pending follow request.
// PATCH /follow-requests/{followerID}
func HandleFollowRequestHandler(w http.ResponseWriter, r *http.Request) {
	currentUserID, ok := r.Context().Value(middleware.UserIDKey).(int64) // This is the followed_id
	if !ok || currentUserID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	followerIDStr := r.PathValue("followerID")
	followerID, err := strconv.ParseInt(followerIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid follower ID in URL path", http.StatusBadRequest)
		return
	}

	var req models.FollowRequestAction
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Action != "accept" && req.Action != "reject" {
		http.Error(w, "Invalid action. Must be 'accept' or 'reject'.", http.StatusBadRequest)
		return
	}

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Check if the pending request exists
	var followRequestID int64
	err = tx.QueryRow("SELECT id FROM followers WHERE follower_id = ? AND followed_id = ? AND status = 'pending'", followerID, currentUserID).Scan(&followRequestID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "No pending follow request found from this user.", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error checking follow request: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var resultMessage string
	if req.Action == "accept" {
		_, err = tx.Exec("UPDATE followers SET status = 'accept', updated_at = ? WHERE id = ?", time.Now(), followRequestID)
		resultMessage = "Follow request accepted."

		// Create notification for follow request acceptance
		if err == nil {
			log.Printf("Creating follow accepted notification from user %d to user %d", followerID, currentUserID)
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("Error creating follow accepted notification: %v", r)
					}
				}()
				NotificationHelper.CreateFollowAcceptedNotification(int(followerID), int(currentUserID))
			}()
		}

		// Update the original follow request notification to show "accepted"
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error updating follow request notification: %v", r)
				}
			}()

			var currentUserUsername string
			err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", currentUserID).Scan(&currentUserUsername)
			if err == nil {
				_, err = database.DB.Exec(`
					UPDATE notifications 
					SET type = 'follow_request_accepted', 
						title = 'Follow Request Accepted', 
						message = ? 
					WHERE user_id = ? AND type = 'follow_request' AND actor_id = ?`,
					"You accepted "+currentUserUsername+"'s follow request",
					currentUserID,
					followerID)
				if err != nil {
					log.Printf("Failed to update follow request notification: %v", err)
				}
			}
		}()
	} else { // reject
		_, err = tx.Exec("DELETE FROM followers WHERE id = ?", followRequestID)
		resultMessage = "Follow request rejected."

		// Update the original follow request notification to show "rejected"
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error updating follow request notification: %v", r)
				}
			}()

			var currentUserUsername string
			err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", currentUserID).Scan(&currentUserUsername)
			if err == nil {
				_, err = database.DB.Exec(`
					UPDATE notifications 
					SET type = 'follow_request_rejected', 
						title = 'Follow Request Rejected', 
						message = ? 
					WHERE user_id = ? AND type = 'follow_request' AND actor_id = ?`,
					"You rejected "+currentUserUsername+"'s follow request",
					currentUserID,
					followerID)
				if err != nil {
					log.Printf("Failed to update follow request notification: %v", err)
				}
			}
		}()
	}

	if err != nil {
		http.Error(w, "Failed to update follow request: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error actioning follow request ID %d by user %d for follower %d: %v", followRequestID, currentUserID, followerID, err)
		return
	}

	if err = tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": resultMessage})
}
