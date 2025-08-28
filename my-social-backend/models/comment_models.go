package models

import "time"

// CreateCommentRequest defines the structure for creating a new comment.
type CreateCommentRequest struct {
	Content string `json:"content"`
}

// CommentResponse defines the structure for a comment returned by the API.
type CommentResponse struct {
	ID              int64     `json:"id"`
	PostID          int64     `json:"post_id"`
	UserID          int64     `json:"user_id"` // Commenter's UserID
	AuthorUsername  string    `json:"author_username"`
	AuthorFirstName string    `json:"author_first_name"`
	AuthorLastName  string    `json:"author_last_name"`
	AuthorAvatar    string    `json:"author_avatar"`
	Content         string    `json:"content"`
	CreatedAt       time.Time `json:"created_at"`
}
