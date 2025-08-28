package models

import "time"

type PrivateMessage struct {
    ID         int64     `json:"id"`
    SenderID   int64     `json:"sender_id"`
    ReceiverID int64     `json:"receiver_id"`
    Content    string    `json:"content"`
    IsRead     bool      `json:"is_read"`
    CreatedAt  time.Time `json:"created_at"`
}

type MessageResponse struct {
    ID             int64     `json:"id"`
    SenderID       int64     `json:"sender_id"`
    ReceiverID     int64     `json:"receiver_id"`
    SenderUsername string    `json:"sender_username"`
    Content        string    `json:"content"`
    IsRead         bool      `json:"is_read"`
    CreatedAt      time.Time `json:"created_at"`
    IsSentByViewer bool      `json:"is_sent_by_viewer"`
}

type SendMessageRequest struct {
    Content string `json:"content"`
}

type Conversation struct {
    ID            int64     `json:"id"`
    User1ID       int64     `json:"user1_id"`
    User2ID       int64     `json:"user2_id"`
    LastMessageID *int64    `json:"last_message_id,omitempty"`
    UpdatedAt     time.Time `json:"updated_at"`
}

// Add to models/message_models.go
type ConversationResponse struct {
    ID                int64      `json:"id"`
    OtherUserID       int64      `json:"other_user_id"`
    OtherUsername     string     `json:"other_username"`
    OtherUserAvatar   string     `json:"other_user_avatar,omitempty"`
    LastMessageText   string     `json:"last_message_text,omitempty"`
    LastMessageTime   *time.Time `json:"last_message_time,omitempty"`
    UnreadCount       int        `json:"unread_count"`
    IsOnline          bool       `json:"is_online"` // New field
}

type TypingIndicatorRequest struct {
    ReceiverID int64 `json:"receiver_id"`
    IsTyping   bool  `json:"is_typing"`
}