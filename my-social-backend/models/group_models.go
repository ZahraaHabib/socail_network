package models

import "time"

type Group struct {
    ID          int64     `json:"id"`
    Title       string    `json:"title"`
    Description string    `json:"description"`
    CreatorID   int64     `json:"creator_id"`
    CreatedAt   time.Time `json:"created_at"`
}

type GroupMember struct {
    ID         int64     `json:"id"`
    GroupID    int64     `json:"group_id"`
    UserID     int64     `json:"user_id"`
    Role       string    `json:"role"`
    Status     string    `json:"status"`
    InvitedBy  int64     `json:"invited_by"`
    RequestedAt *time.Time `json:"requested_at,omitempty"`
    InvitedAt  *time.Time `json:"invited_at,omitempty"`
    AcceptedAt *time.Time `json:"accepted_at,omitempty"`
}
type GroupEvent struct {
    ID          int64     `json:"id"`
    GroupID     int64     `json:"group_id"`
    CreatorID   int64     `json:"creator_id"`
    Title       string    `json:"title"`
    Description string    `json:"description"`
    EventTime   time.Time `json:"event_time"`
    CreatedAt   time.Time `json:"created_at"`
}

type GroupEventRSVP struct {
    ID        int64     `json:"id"`
    EventID   int64     `json:"event_id"`
    UserID    int64     `json:"user_id"`
    Response  string    `json:"response"`
    RespondedAt time.Time `json:"responded_at"`
}