package models

import "time"

// CreatePostRequest defines the structure for creating a new post.
type CreatePostRequest struct {
	Content   string `json:"content"`
	ImagePath string `json:"image_path,omitempty"` // Optional: Path to uploaded image
	Privacy   int    `json:"privacy"`              // 0=public, 1=followers, 2=close_friends
}

// PostResponse defines the structure for a post returned by the API.
// This includes fields that were added in previous steps like LikeCount and UserLiked.
// ...existing code...
type PostResponse struct {
	ID              int64     `json:"id"`
	UserID          int64     `json:"user_id"` // Author's UserID
	AuthorUsername  string    `json:"author_username"`
	AuthorFirstName string    `json:"author_first_name"`
	AuthorLastName  string    `json:"author_last_name"`
	AuthorAvatar    string    `json:"author_avatar"`
	Content         string    `json:"content"`
	ImagePath       string    `json:"image_path,omitempty"` // Path to post image
	Title           string    `json:"title,omitempty"`      // Added Title field
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	LikeCount       int       `json:"like_count"`
	DislikeCount    int       `json:"dislike_count"`
	UserLiked       bool      `json:"user_liked"`
	UserDisliked    bool      `json:"user_disliked"`
	Privacy         int       `json:"privacy,omitempty"` // Added Privacy field
}

// Close Friends Models
type CloseFriendRequest struct {
	TargetUserID int64 `json:"target_user_id"`
}

type CloseFriendResponse struct {
	ID            int64  `json:"id"`
	Username      string `json:"username"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	Avatar        string `json:"avatar"`
	IsCloseFriend bool   `json:"is_close_friend"`
}
