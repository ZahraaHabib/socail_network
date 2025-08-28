package models

import "time"

// RegisterRequest defines the structure for the registration request body.
type RegisterRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password_hash"` // Field name matches your DB schema
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	DateOfBirth string `json:"date_of_birth"`
	Avatar      string `json:"avatar"`
	AboutMe     string `json:"about_me"`
}

// UserResponse defines the structure for the user data returned after registration/login.
// This is similar to models.UserResponse in the workspace.
type UserResponse struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

// LoginRequest defines the structure for the login request body.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// User represents a user in the database (can be expanded).
// This is more for internal use or if you need a full user object.
type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-" db:"password"` // Store hashed password, exclude from JSON
	CreatedAt time.Time `json:"created_at"`
}

// UserProfileResponse defines the structure for a user's public profile.
type UserProfileResponse struct {
	ID        int64          `json:"id"`
	Username  string         `json:"username"`
	Email     string         `json:"email"` // Consider if email should be public
	CreatedAt time.Time      `json:"created_at"`
	Posts     []PostResponse `json:"posts,omitempty"` // List of user's posts
	// Add more fields later: FollowersCount, FollowingCount, Bio, AvatarURL etc.
}

// --- User Profile V2 Models ---

// UserBasicInfoV2 contains core user details for the V2 profile.
// This will be part of the UserProfileV2Response.
type UserBasicInfoV2 struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	FirstName   string    `json:"first_name"` // Always include even if empty
	LastName    string    `json:"last_name"`  // Always include even if empty
	Avatar      string    `json:"avatar"`     // Always include even if empty
	AboutMe     string    `json:"about_me"`   // Always include even if empty
	CreatedAt   time.Time `json:"created_at"`
	IsPrivate   bool      `json:"is_private"`
	DateOfBirth string    `json:"date_of_birth"` // Always include even if empty
	Email       string    `json:"email"`
}

// UserStatsV2 provides counts related to a user for the V2 profile.
// This will be part of the UserProfileV2Response.
type UserStatsV2 struct {
	FollowersCount int `json:"followers_count"`
	FollowingCount int `json:"following_count"`
	PostsCount     int `json:"posts_count"`
}

// UserRelationshipV2 describes the follow relationship between the viewer and the profile owner for V2.
// This will be part of the UserProfileV2Response.
type UserRelationshipV2 struct {
	IsFollowedByViewer          bool `json:"is_followed_by_viewer"`
	HasPendingRequestFromViewer bool `json:"has_pending_request_from_viewer"`
	IsCloseFriend               bool `json:"is_close_friend"`
}

// UserProfileV2Response is the response structure for the V2 user profile endpoint.
// It uses the existing PostResponse for consistency.
type UserProfileV2Response struct {
	User         UserBasicInfoV2     `json:"user"`
	Stats        UserStatsV2         `json:"stats"`
	Relationship *UserRelationshipV2 `json:"relationship,omitempty"` // Pointer to allow null if not applicable (e.g., viewing own profile or not logged in)
	Posts        []PostResponse      `json:"posts,omitempty"`        // Reusing your existing PostResponse
}
