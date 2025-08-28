package models

// LikePostRequest defines the structure for liking/disliking a post.
type LikePostRequest struct {
	IsLike bool `json:"is_like"` // true for like, false for dislike
}

// LikeResponse defines the structure for the like/dislike action response.
type LikeResponse struct {
	PostID       int64 `json:"post_id"`
	Liked        bool  `json:"liked"`         // True if user currently likes the post
	Disliked     bool  `json:"disliked"`      // True if user currently dislikes the post
	LikeCount    int   `json:"like_count"`    // Total number of likes
	DislikeCount int   `json:"dislike_count"` // Total number of dislikes
}
