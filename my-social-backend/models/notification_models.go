package models

import (
	"database/sql"
	"time"
)

// Notification represents a notification in the system
type Notification struct {
	ID          int       `json:"id"`
	UserID      int       `json:"user_id"`      // Who receives the notification
	Type        string    `json:"type"`         // follow_request, follow_accepted, post_like, post_comment, etc.
	Title       string    `json:"title"`        // Short title
	Message     string    `json:"message"`      // Detailed message
	RelatedID   *int      `json:"related_id"`   // ID of related object (post_id, user_id, etc.)
	RelatedType *string   `json:"related_type"` // Type of related object (post, user, comment, etc.)
	ActorID     *int      `json:"actor_id"`     // Who triggered the notification
	IsRead      bool      `json:"is_read"`
	CreatedAt   time.Time `json:"created_at"`
}

// NotificationCount represents unread notification count
type NotificationCount struct {
	UnreadCount int `json:"unread_count"`
}

// CreateNotificationRequest represents request to create a notification
type CreateNotificationRequest struct {
	UserID      int     `json:"user_id"`
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	Message     string  `json:"message"`
	RelatedID   *int    `json:"related_id"`
	RelatedType *string `json:"related_type"`
	ActorID     *int    `json:"actor_id"`
}

// NotificationService handles notification operations
type NotificationService struct {
	DB *sql.DB
}

// NewNotificationService creates a new notification service
func NewNotificationService(db *sql.DB) *NotificationService {
	return &NotificationService{DB: db}
}

// CreateNotification creates a new notification
func (ns *NotificationService) CreateNotification(req CreateNotificationRequest) error {
	query := `
		INSERT INTO notifications (user_id, type, title, message, related_id, related_type, actor_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err := ns.DB.Exec(query, req.UserID, req.Type, req.Title, req.Message, req.RelatedID, req.RelatedType, req.ActorID)
	return err
}

// GetNotifications retrieves notifications for a user
func (ns *NotificationService) GetNotifications(userID int, limit int) ([]Notification, error) {
	query := `
		SELECT id, user_id, type, title, message, related_id, related_type, actor_id, is_read, created_at
		FROM notifications
		WHERE user_id = ? AND type != 'new_message'
		ORDER BY created_at DESC
		LIMIT ?
	`
	rows, err := ns.DB.Query(query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []Notification
	for rows.Next() {
		var n Notification
		err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Message, &n.RelatedID, &n.RelatedType, &n.ActorID, &n.IsRead, &n.CreatedAt)
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, n)
	}
	return notifications, nil
}

// GetUnreadCount returns the count of unread notifications for a user (excluding messages)
func (ns *NotificationService) GetUnreadCount(userID int) (int, error) {
	query := `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE AND type != 'new_message'`
	var count int
	err := ns.DB.QueryRow(query, userID).Scan(&count)
	return count, err
}

// MarkAsRead marks a specific notification as read
func (ns *NotificationService) MarkAsRead(notificationID int, userID int) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`
	_, err := ns.DB.Exec(query, notificationID, userID)
	return err
}

// MarkAllAsRead marks all notifications as read for a user (excluding messages)
func (ns *NotificationService) MarkAllAsRead(userID int) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE AND type != 'new_message'`
	_, err := ns.DB.Exec(query, userID)
	return err
}

// DeleteOldNotifications deletes notifications older than specified days
func (ns *NotificationService) DeleteOldNotifications(days int) error {
	query := `DELETE FROM notifications WHERE created_at < datetime('now', '-' || ? || ' days')`
	_, err := ns.DB.Exec(query, days)
	return err
}
