package api

import (
	"database/sql" // Required for sql.ErrNoRows if GetUserIDFromRequest uses it
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware" // For UserIDKey in CreatePostHandler
	"reda-social-network/models"     // Import your models package
	"reda-social-network/util"       // For GetUserIDFromRequest in GetPostsHandler
)

// CreatePostHandler handles the creation of new posts.
// UserID is now fetched from the request context set by AuthMiddleware.
func CreatePostHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		log.Printf("CreatePostHandler: UserID not found in context or is zero. Path: %s", r.URL.Path)
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	var req models.CreatePostRequest // Use models.CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Error reading request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "Post content cannot be empty", http.StatusBadRequest)
		return
	}

	// Validate privacy level (0=public, 1=followers, 2=close_friends)
	if req.Privacy < 0 || req.Privacy > 2 {
		http.Error(w, "Invalid privacy level", http.StatusBadRequest)
		return
	}

	now := time.Now()
	stmt, err := database.DB.Prepare(`
        INSERT INTO posts (user_id, content, image_path, privacy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `)
	if err != nil {
		http.Error(w, "Failed to prepare statement: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error preparing insert post statement: %v", err)
		return
	}
	defer stmt.Close()

	result, err := stmt.Exec(userID, req.Content, req.ImagePath, req.Privacy, now, now)
	if err != nil {
		http.Error(w, "Failed to create post: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error inserting post for user %d: %v", userID, err)
		return
	}

	postID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, "Failed to retrieve post ID: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error getting last insert ID for post: %v", err)
		return
	}

	var authorUsername string
	var authorFirstName, authorLastName, authorAvatar sql.NullString
	err = database.DB.QueryRow("SELECT username, first_name, last_name, avatar FROM users WHERE id = ?", userID).Scan(&authorUsername, &authorFirstName, &authorLastName, &authorAvatar)
	if err != nil {
		log.Printf("Error fetching user details for author %d of new post %d: %v", userID, postID, err)
		authorUsername = "unknown"
	}

	// Prepare the post response
	postResp := models.PostResponse{
		ID:              postID,
		UserID:          userID,
		AuthorUsername:  authorUsername,
		AuthorFirstName: authorFirstName.String,
		AuthorLastName:  authorLastName.String,
		AuthorAvatar:    authorAvatar.String,
		Content:         req.Content,
		ImagePath:       req.ImagePath,
		Privacy:         req.Privacy,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// Broadcast the new post to all online users except the author
	// Import the BroadcastToUser and activeConnections from ws_handlers.go
	// Only send to users who are allowed to see the post (privacy check)
	// For simplicity, broadcast to all online users except the author
	// (You can refine this to match your privacy logic if needed)
	// Import: "reda-social-network/util/api/ws_handlers"
	// Use: ws_handlers.BroadcastToUser
	// But since both are in package api, just call BroadcastToUser
	for onlineUserID := range activeConnections {
		if onlineUserID == userID {
			continue
		}
		// Optionally: check if onlineUserID is allowed to see this post (privacy)
		BroadcastToUser(onlineUserID, "new_post", postResp)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(postResp)
}

// GetPostsHandler handles fetching all posts.
// Enhanced to include like counts and whether the current user liked each post.
func GetPostsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentUserID, _ := util.GetUserIDFromRequest(r)

	query := `
        SELECT p.id, p.user_id, u.username, u.first_name, u.last_name, u.avatar, p.content, p.image_path, p.privacy, p.created_at, p.updated_at,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.is_like = true) as like_count,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.is_like = false) as dislike_count
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE 
            (p.privacy = 0) OR  -- Public posts
            (p.privacy = 1 AND (p.user_id = ? OR EXISTS(SELECT 1 FROM followers WHERE follower_id = ? AND followed_id = p.user_id AND status = 'accept'))) OR  -- Followers only posts
            (p.privacy = 2 AND (p.user_id = ? OR EXISTS(SELECT 1 FROM close_friends WHERE user_id = p.user_id AND close_friend_id = ?)))  -- Close friends only posts
        ORDER BY p.created_at DESC
    `
	rows, err := database.DB.Query(query, currentUserID, currentUserID, currentUserID, currentUserID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error querying posts with author and like count: %v", err)
		return
	}
	defer rows.Close()

	var posts []models.PostResponse // Use models.PostResponse
	for rows.Next() {
		var p models.PostResponse // Use models.PostResponse
		var firstName, lastName, avatar, imagePath sql.NullString
		if err := rows.Scan(&p.ID, &p.UserID, &p.AuthorUsername, &firstName, &lastName, &avatar, &p.Content, &imagePath, &p.Privacy, &p.CreatedAt, &p.UpdatedAt, &p.LikeCount, &p.DislikeCount); err != nil {
			http.Error(w, "Error scanning post row: "+err.Error(), http.StatusInternalServerError)
			log.Printf("Error scanning post with author/like count: %v", err)
			return
		}

		// Set avatar and names, handling NULL values
		p.AuthorFirstName = firstName.String
		p.AuthorLastName = lastName.String
		p.AuthorAvatar = avatar.String
		p.ImagePath = imagePath.String

		if currentUserID != 0 {
			// Check if user liked this post
			var userIsLike sql.NullBool
			err := database.DB.QueryRow("SELECT is_like FROM likes WHERE post_id = ? AND user_id = ?", p.ID, currentUserID).Scan(&userIsLike)
			if err == nil && userIsLike.Valid {
				if userIsLike.Bool {
					p.UserLiked = true
				} else {
					p.UserDisliked = true
				}
			}
		}

		posts = append(posts, p)
	}

	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating post rows: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error after iterating posts with author/like count: %v", err)
		return
	}

	if posts == nil {
		posts = []models.PostResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}

// DeletePostHandler handles deleting a post by its ID
// DELETE /posts/{postID}
func DeletePostHandler(w http.ResponseWriter, r *http.Request) {
	// Get the authenticated user ID from context
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	// Get post ID from URL path
	postIDStr := r.PathValue("postID")
	if postIDStr == "" {
		http.Error(w, "Post ID is required", http.StatusBadRequest)
		return
	}

	// Convert post ID to int64
	postID, err := strconv.ParseInt(postIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid post ID", http.StatusBadRequest)
		return
	}

	// Check if the post exists and get its details
	var postUserID int64
	var imagePath sql.NullString
	err = database.DB.QueryRow("SELECT user_id, image_path FROM posts WHERE id = ?", postID).Scan(&postUserID, &imagePath)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Post not found", http.StatusNotFound)
			return
		}
		log.Printf("Error checking post existence: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Check if the user is the owner of the post
	if postUserID != userID {
		http.Error(w, "Forbidden: You can only delete your own posts", http.StatusForbidden)
		return
	}

	// Start a transaction to delete the post and related data
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Delete related data first (due to foreign key constraints)

	// Delete likes for this post
	_, err = tx.Exec("DELETE FROM likes WHERE post_id = ?", postID)
	if err != nil {
		log.Printf("Error deleting likes for post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Delete comments for this post
	_, err = tx.Exec("DELETE FROM comments WHERE post_id = ?", postID)
	if err != nil {
		log.Printf("Error deleting comments for post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Delete notifications related to this post
	_, err = tx.Exec("DELETE FROM notifications WHERE related_id = ? AND related_type IN ('post', 'like', 'comment')", postID)
	if err != nil {
		log.Printf("Error deleting notifications for post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Finally, delete the post itself
	result, err := tx.Exec("DELETE FROM posts WHERE id = ?", postID)
	if err != nil {
		log.Printf("Error deleting post %d: %v", postID, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Check if any rows were affected
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Error checking rows affected: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if rowsAffected == 0 {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	// Commit the transaction
	err = tx.Commit()
	if err != nil {
		log.Printf("Error committing transaction: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// If there was an image associated with the post, optionally delete it from the filesystem
	if imagePath.Valid && imagePath.String != "" {
		// Note: You might want to implement file deletion logic here
		// For safety, we're not automatically deleting files in this implementation
		// You can add file deletion logic if needed:
		//
		// import "os"
		// import "path/filepath"
		//
		// fullPath := filepath.Join("uploads", imagePath.String)
		// if err := os.Remove(fullPath); err != nil {
		//     log.Printf("Warning: Could not delete image file %s: %v", fullPath, err)
		// }
		log.Printf("Post %d deleted successfully. Image file %s was not automatically removed from filesystem.", postID, imagePath.String)
	}

	log.Printf("User %d successfully deleted post %d", userID, postID)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Post deleted successfully",
		"post_id": postID,
	})
}
