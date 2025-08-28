package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
	"reda-social-network/database"
	"reda-social-network/middleware" // For UserIDKey
	"reda-social-network/models"     // Import your new models package
)

// ToggleLikePostHandler handles liking or disliking a post.
// Expected URL: POST /posts/{postID}/like
func ToggleLikePostHandler(w http.ResponseWriter, r *http.Request) {
	// Get UserID from context (set by AuthMiddleware)
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	postIDStr := r.PathValue("postID")
	postID, err := strconv.ParseInt(postIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid post ID in URL path", http.StatusBadRequest)
		return
	}

	// Parse request body to get whether it's a like or dislike
	var req models.LikePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Error reading request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Check if the post exists and get the owner's ID
	var postExists bool
	var postOwnerID int64
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM posts WHERE id = ?), COALESCE(user_id, 0) FROM posts WHERE id = ?", postID, postID).Scan(&postExists, &postOwnerID)
	if err != nil {
		http.Error(w, "Error checking post existence: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !postExists {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	// Check if the user has already liked/disliked this post
	var existingLikeID int64
	var existingIsLike bool
	queryRowErr := database.DB.QueryRow("SELECT id, is_like FROM likes WHERE user_id = ? AND post_id = ?", userID, postID).Scan(&existingLikeID, &existingIsLike)

	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "Failed to start transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback() // Rollback if not committed

	switch queryRowErr {
	case sql.ErrNoRows:
		// User hasn't liked/disliked this post yet, so add new reaction
		_, err = tx.Exec(`
            INSERT INTO likes (user_id, post_id, is_like, created_at)
            VALUES (?, ?, ?, ?)
        `, userID, postID, req.IsLike, time.Now())
		if err != nil {
			http.Error(w, "Failed to add reaction: "+err.Error(), http.StatusInternalServerError)
			log.Printf("Error inserting reaction for post %d by user %d: %v", postID, userID, err)
			return
		}

		// Create notification for post like (only for likes, not dislikes)
		if req.IsLike {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("Error creating like notification: %v", r)
					}
				}()
				NotificationHelper.CreatePostLikeNotification(int(userID), int(postOwnerID), int(postID))
			}()
		}

		log.Printf("User %d %s post %d", userID, map[bool]string{true: "liked", false: "disliked"}[req.IsLike], postID)
	case nil:
		// User has already reacted to this post
		if existingIsLike == req.IsLike {
			// Same reaction - remove it (toggle off)
			_, err = tx.Exec("DELETE FROM likes WHERE id = ?", existingLikeID)
			if err != nil {
				http.Error(w, "Failed to remove reaction: "+err.Error(), http.StatusInternalServerError)
				log.Printf("Error deleting reaction %d for post %d by user %d: %v", existingLikeID, postID, userID, err)
				return
			}
			log.Printf("User %d removed %s from post %d", userID, map[bool]string{true: "like", false: "dislike"}[existingIsLike], postID)
		} else {
			// Different reaction - update it
			_, err = tx.Exec("UPDATE likes SET is_like = ? WHERE id = ?", req.IsLike, existingLikeID)
			if err != nil {
				http.Error(w, "Failed to update reaction: "+err.Error(), http.StatusInternalServerError)
				log.Printf("Error updating reaction %d for post %d by user %d: %v", existingLikeID, postID, userID, err)
				return
			}

			// Create notification if switching to like (from dislike to like)
			if req.IsLike {
				go func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("Error creating like notification: %v", r)
						}
					}()
					NotificationHelper.CreatePostLikeNotification(int(userID), int(postOwnerID), int(postID))
				}()
			}

			log.Printf("User %d changed reaction on post %d to %s", userID, postID, map[bool]string{true: "like", false: "dislike"}[req.IsLike])
		}
	default:
		// Other database error from QueryRow
		http.Error(w, "Database error checking reaction: "+queryRowErr.Error(), http.StatusInternalServerError)
		log.Printf("Error checking reaction for post %d by user %d: %v", postID, userID, queryRowErr)
		return
	}

	// Get the current user's reaction status
	var userLiked, userDisliked bool
	var userIsLike sql.NullBool
	err = tx.QueryRow("SELECT is_like FROM likes WHERE user_id = ? AND post_id = ?", userID, postID).Scan(&userIsLike)
	if err == nil && userIsLike.Valid {
		if userIsLike.Bool {
			userLiked = true
		} else {
			userDisliked = true
		}
	}

	// Get the like and dislike counts
	var likeCount, dislikeCount int
	err = tx.QueryRow("SELECT COUNT(*) FROM likes WHERE post_id = ? AND is_like = true", postID).Scan(&likeCount)
	if err != nil {
		http.Error(w, "Failed to get like count: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error getting like count for post %d: %v", postID, err)
		return
	}

	err = tx.QueryRow("SELECT COUNT(*) FROM likes WHERE post_id = ? AND is_like = false", postID).Scan(&dislikeCount)
	if err != nil {
		http.Error(w, "Failed to get dislike count: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error getting dislike count for post %d: %v", postID, err)
		return
	}

	if err = tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(models.LikeResponse{
		PostID:       postID,
		Liked:        userLiked,
		Disliked:     userDisliked,
		LikeCount:    likeCount,
		DislikeCount: dislikeCount,
	})

	// Broadcast like/dislike update to all connected users (real-time update)
	go BroadcastLikeUpdate(postID, likeCount, dislikeCount)
}
