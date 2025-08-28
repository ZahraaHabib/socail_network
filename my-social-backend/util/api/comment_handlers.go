package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	// Replace 'your_module_name' with your actual module name
	"reda-social-network/database"
	"reda-social-network/middleware" // For UserIDKey
	"reda-social-network/models"     // Import your models package
)

// CreateCommentHandler handles adding a new comment to a post.
// Expected URL: POST /posts/{postID}/comments
func CreateCommentHandler(w http.ResponseWriter, r *http.Request) {
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

	var req models.CreateCommentRequest // Use models.CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Error reading request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, "Comment content cannot be empty", http.StatusBadRequest)
		return
	}

	// Check if post exists and get the post owner's ID
	var exists bool
	var postOwnerID int64
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM posts WHERE id = ?), COALESCE(user_id, 0) FROM posts WHERE id = ?", postID, postID).Scan(&exists, &postOwnerID)
	if err != nil {
		http.Error(w, "Error checking post existence: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	now := time.Now()
	stmt, err := database.DB.Prepare(`
        INSERT INTO comments (post_id, user_id, content, created_at)
        VALUES (?, ?, ?, ?)
    `)
	if err != nil {
		http.Error(w, "Failed to prepare statement: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error preparing insert comment statement: %v", err)
		return
	}
	defer stmt.Close()

	result, err := stmt.Exec(postID, userID, req.Content, now)
	if err != nil {
		http.Error(w, "Failed to create comment: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error inserting comment for post %d by user %d: %v", postID, userID, err)
		return
	}

	commentID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, "Failed to retrieve comment ID: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error getting last insert ID for comment: %v", err)
		return
	}

	// Create notification for post comment (in a separate goroutine to not block the response)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Error creating comment notification: %v", r)
			}
		}()
		NotificationHelper.CreatePostCommentNotification(int(userID), int(postOwnerID), int(postID))
	}()

	var authorUsername string
	var authorFirstName, authorLastName, authorAvatar sql.NullString
	err = database.DB.QueryRow("SELECT username, first_name, last_name, avatar FROM users WHERE id = ?", userID).Scan(&authorUsername, &authorFirstName, &authorLastName, &authorAvatar)
	if err != nil {
		log.Printf("Error fetching user details for commenter %d of new comment %d: %v", userID, commentID, err)
		authorUsername = "unknown"
	}

	commentResp := models.CommentResponse{
		ID:              commentID,
		PostID:          postID,
		UserID:          userID,
		AuthorUsername:  authorUsername,
		AuthorFirstName: authorFirstName.String,
		AuthorLastName:  authorLastName.String,
		AuthorAvatar:    authorAvatar.String,
		Content:         req.Content,
		CreatedAt:       now,
	}

	// Broadcast the new comment to all online users except the commenter
	for onlineUserID := range activeConnections {
		if onlineUserID == userID {
			continue
		}
		BroadcastToUser(onlineUserID, "new_comment", commentResp)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(commentResp)
}

// GetCommentsForPostHandler handles fetching all comments for a specific post.
// Expected URL: GET /posts/{postID}/comments
func GetCommentsForPostHandler(w http.ResponseWriter, r *http.Request) {
	postIDStr := r.PathValue("postID")
	postID, err := strconv.ParseInt(postIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid post ID in URL path", http.StatusBadRequest)
		return
	}

	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM posts WHERE id = ?)", postID).Scan(&exists)
	if err != nil {
		http.Error(w, "Error checking post existence: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !exists {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}

	query := `
        SELECT c.id, c.post_id, c.user_id, u.username, u.first_name, u.last_name, u.avatar, c.content, c.created_at
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
    `
	rows, err := database.DB.Query(query, postID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error querying comments for post %d: %v", postID, err)
		return
	}
	defer rows.Close()

	var comments []models.CommentResponse // Use models.CommentResponse
	for rows.Next() {
		var c models.CommentResponse // Use models.CommentResponse
		var firstName, lastName, avatar sql.NullString
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.AuthorUsername, &firstName, &lastName, &avatar, &c.Content, &c.CreatedAt); err != nil {
			http.Error(w, "Error scanning comment row: "+err.Error(), http.StatusInternalServerError)
			log.Printf("Error scanning comment for post %d: %v", postID, err)
			return
		}

		// Set avatar and names, handling NULL values
		c.AuthorFirstName = firstName.String
		c.AuthorLastName = lastName.String
		c.AuthorAvatar = avatar.String

		comments = append(comments, c)
	}

	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating comment rows: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error after iterating comments for post %d: %v", postID, err)
		return
	}

	if comments == nil {
		comments = []models.CommentResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}
