package models

import "time"

// UserFollowInfo provides basic user details for follower/following lists.
type UserFollowInfo struct {
    ID        int64  `json:"id"`
    Username  string `json:"username"`
    FirstName string `json:"first_name,omitempty"`
    LastName  string `json:"last_name,omitempty"`
    Avatar    string `json:"avatar,omitempty"`
}

// FollowRequestAction is used when accepting or rejecting a follow request.
type FollowRequestAction struct {
    Action string `json:"action" binding:"required,oneof=accept reject"` // "accept" or "reject"
}

// FollowStatusResponse indicates the result of a follow/unfollow action.
type FollowStatusResponse struct {
    TargetUserID int64  `json:"target_user_id"`
    Status       string `json:"status"` // e.g., "following", "pending_approval", "not_following"
    Message      string `json:"message,omitempty"`
}

// Follower represents a row in the followers table, useful for internal logic.
type Follower struct {
    ID          int64
    FollowerID  int64
    FollowedID  int64
    Status      string // 'pending', 'accept'
    CreatedAt   time.Time
    UpdatedAt   time.Time
}