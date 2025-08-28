package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/models"
)

// GetNotificationsHandler retrieves notifications for the authenticated user
func GetNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	// Get limit from query params (default 20)
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	notifications, err := notificationService.GetNotifications(int(userID), limit)
	if err != nil {
		http.Error(w, "Failed to fetch notifications", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notifications)
}

// GetUnreadCountHandler returns the count of unread notifications
func GetUnreadCountHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	count, err := notificationService.GetUnreadCount(int(userID))
	if err != nil {
		http.Error(w, "Failed to fetch unread count", http.StatusInternalServerError)
		return
	}

	response := models.NotificationCount{UnreadCount: count}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// MarkNotificationAsReadHandler marks a specific notification as read
func MarkNotificationAsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	notificationIDStr := r.PathValue("notificationID")
	notificationID, err := strconv.Atoi(notificationIDStr)
	if err != nil {
		http.Error(w, "Invalid notification ID", http.StatusBadRequest)
		return
	}

	err = notificationService.MarkAsRead(notificationID, int(userID))
	if err != nil {
		http.Error(w, "Failed to mark notification as read", http.StatusInternalServerError)
		return
	}

	// Send updated unread count via WebSocket
	BroadcastUnreadCountToUser(int(userID))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// MarkAllNotificationsAsReadHandler marks all notifications as read for the user
func MarkAllNotificationsAsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	err := notificationService.MarkAllAsRead(int(userID))
	if err != nil {
		http.Error(w, "Failed to mark all notifications as read", http.StatusInternalServerError)
		return
	}

	// Send updated unread count via WebSocket
	BroadcastUnreadCountToUser(int(userID))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// NotificationHelpers contains utility functions for creating notifications
type NotificationHelpers struct{}

// CreateFollowRequestNotification creates a notification when someone requests to follow a user
func (nh *NotificationHelpers) CreateFollowRequestNotification(followerID, targetUserID int) {
	log.Printf("Creating follow request notification from user %d to user %d", followerID, targetUserID)

	// Get follower's username for the message
	var followerUsername string
	err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", followerID).Scan(&followerUsername)
	if err != nil {
		log.Printf("Error getting follower username for notification (ID: %d): %v", followerID, err)
		return // Silently fail notification creation
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	req := models.CreateNotificationRequest{
		UserID:      targetUserID,
		Type:        "follow_request",
		Title:       "New Follow Request",
		Message:     followerUsername + " wants to follow you",
		RelatedID:   &followerID,
		RelatedType: stringPtr("user"),
		ActorID:     &followerID,
	}

	err = notificationService.CreateNotification(req)
	if err != nil {
		log.Printf("Error creating follow request notification: %v", err)
	} else {
		log.Printf("Successfully created follow request notification")
		// Send real-time notification via WebSocket
		BroadcastNotificationToUser(targetUserID, "follow_request", req)
	}
}

// CreateFollowAcceptedNotification creates a notification when a follow request is accepted
func (nh *NotificationHelpers) CreateFollowAcceptedNotification(requesterID, accepterID int) {
	log.Printf("Creating follow accepted notification from user %d to user %d", accepterID, requesterID)

	// Get accepter's username for the message
	var accepterUsername string
	err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", accepterID).Scan(&accepterUsername)
	if err != nil {
		log.Printf("Error getting accepter username for notification (ID: %d): %v", accepterID, err)
		return // Silently fail notification creation
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	req := models.CreateNotificationRequest{
		UserID:      requesterID,
		Type:        "follow_accepted",
		Title:       "Follow Request Accepted",
		Message:     accepterUsername + " accepted your follow request",
		RelatedID:   &accepterID,
		RelatedType: stringPtr("user"),
		ActorID:     &accepterID,
	}

	err = notificationService.CreateNotification(req)
	if err != nil {
		log.Printf("Error creating follow accepted notification: %v", err)
	} else {
		log.Printf("Successfully created follow accepted notification")
		// Send real-time notification via WebSocket
		BroadcastNotificationToUser(requesterID, "follow_accepted", req)
	}
}

// CreateDirectFollowNotification creates a notification when someone follows a public user directly
func (nh *NotificationHelpers) CreateDirectFollowNotification(followerID, targetUserID int) {
	log.Printf("Creating direct follow notification from user %d to user %d", followerID, targetUserID)

	// Get follower's username for the message
	var followerUsername string
	err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", followerID).Scan(&followerUsername)
	if err != nil {
		log.Printf("Error getting follower username for notification (ID: %d): %v", followerID, err)
		return // Silently fail notification creation
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	req := models.CreateNotificationRequest{
		UserID:      targetUserID,
		Type:        "new_follower",
		Title:       "New Follower",
		Message:     followerUsername + " started following you",
		RelatedID:   &followerID,
		RelatedType: stringPtr("user"),
		ActorID:     &followerID,
	}

	err = notificationService.CreateNotification(req)
	if err != nil {
		log.Printf("Error creating direct follow notification: %v", err)
	} else {
		log.Printf("Successfully created direct follow notification")
		// Send real-time notification via WebSocket
		BroadcastNotificationToUser(targetUserID, "new_follower", req)
	}
}

// CreatePostLikeNotification creates a notification when someone likes a post
func (nh *NotificationHelpers) CreatePostLikeNotification(likerID, postOwnerID, postID int) {
	// Don't notify if user likes their own post
	if likerID == postOwnerID {
		return
	}

	// Get liker's username for the message
	var likerUsername string
	err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", likerID).Scan(&likerUsername)
	if err != nil {
		return // Silently fail notification creation
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	req := models.CreateNotificationRequest{
		UserID:      postOwnerID,
		Type:        "post_like",
		Title:       "Post Liked",
		Message:     likerUsername + " liked your post",
		RelatedID:   &postID,
		RelatedType: stringPtr("post"),
		ActorID:     &likerID,
	}

	err = notificationService.CreateNotification(req)
	if err == nil {
		// Send real-time notification via WebSocket
		BroadcastNotificationToUser(postOwnerID, "post_like", req)
	}
}

// CreatePostCommentNotification creates a notification when someone comments on a post
func (nh *NotificationHelpers) CreatePostCommentNotification(commenterID, postOwnerID, postID int) {
	// Don't notify if user comments on their own post
	if commenterID == postOwnerID {
		return
	}

	// Get commenter's username for the message
	var commenterUsername string
	err := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", commenterID).Scan(&commenterUsername)
	if err != nil {
		return // Silently fail notification creation
	}

	// Create notification service instance
	notificationService := models.NewNotificationService(database.DB)

	req := models.CreateNotificationRequest{
		UserID:      postOwnerID,
		Type:        "post_comment",
		Title:       "New Comment",
		Message:     commenterUsername + " commented on your post",
		RelatedID:   &postID,
		RelatedType: stringPtr("post"),
		ActorID:     &commenterID,
	}

	err = notificationService.CreateNotification(req)
	if err == nil {
		// Send real-time notification via WebSocket
		BroadcastNotificationToUser(postOwnerID, "post_comment", req)
	}
}

// Helper function to create string pointers
func stringPtr(s string) *string {
	return &s
}

// BroadcastNotificationToUser sends a real-time notification via WebSocket
func BroadcastNotificationToUser(userID int, notificationType string, notification models.CreateNotificationRequest) {
	// Use the existing BroadcastToUser function from ws_handlers.go
	data := map[string]interface{}{
		"type":         notification.Type,
		"title":        notification.Title,
		"message":      notification.Message,
		"related_id":   notification.RelatedID,
		"related_type": notification.RelatedType,
		"actor_id":     notification.ActorID,
	}

	BroadcastToUser(int64(userID), notificationType, data)
	log.Printf("Broadcasted %s notification to user %d via WebSocket", notificationType, userID)

	// Also send updated unread count
	BroadcastUnreadCountToUser(userID)
}

// BroadcastUnreadCountToUser sends updated unread notification count via WebSocket
func BroadcastUnreadCountToUser(userID int) {
	// Get current unread count
	notificationService := models.NewNotificationService(database.DB)
	count, err := notificationService.GetUnreadCount(userID)
	if err != nil {
		log.Printf("Error getting unread count for user %d: %v", userID, err)
		return
	}

	// Broadcast the count update
	data := map[string]interface{}{
		"unread_count": count,
	}

	BroadcastToUser(int64(userID), "notification_count_update", data)
	log.Printf("Broadcasted unread count (%d) to user %d via WebSocket", count, userID)
}

// Global notification helpers instance
var NotificationHelper = &NotificationHelpers{}
