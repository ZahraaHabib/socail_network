package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/models"
)

// CheckFollowRelationship checks if users can message each other
func checkCanMessage(userID, otherUserID int64) (bool, error) {
	var count int
	err := database.DB.QueryRow(`
        SELECT COUNT(*) FROM followers 
        WHERE (follower_id = ? AND followed_id = ? AND status = 'accept') 
           OR (follower_id = ? AND followed_id = ? AND status = 'accept')
    `, userID, otherUserID, otherUserID, userID).Scan(&count)

	return count > 0, err
}

// checkShouldReceiveInstantMessage checks if recipient should receive instant message via WebSocket
// Rules: Recipient gets instant message if:
// 1. Recipient is following the sender, OR
// 2. Recipient has a public profile (is_private = false)
func checkShouldReceiveInstantMessage(senderID, receiverID int64) (bool, error) {
	// Check if recipient is following the sender
	var isFollowing bool
	err := database.DB.QueryRow(`

	SELECT EXISTS(
            SELECT 1 FROM followers 
            WHERE follower_id = ? AND followed_id = ? AND status = 'accept'
        )
    `, receiverID, senderID).Scan(&isFollowing)
	if err != nil {
		return false, err
	}

	if isFollowing {
		return true, nil
	}

	// Check if recipient has a public profile
	var isPublic bool
	err = database.DB.QueryRow(`
        SELECT NOT COALESCE(is_private, false) FROM users WHERE id = ?
    `, receiverID).Scan(&isPublic)
	if err != nil {
		return false, err
	}

	return isPublic, nil
}

// POST /messages/{receiverID} - Send a message
// POST /messages/{receiverID} - Send a message
// Now uses private_messages table only
func SendMessageHandler(w http.ResponseWriter, r *http.Request) {
	senderID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || senderID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	receiverIDStr := r.PathValue("receiverID")
	receiverID, err := strconv.ParseInt(receiverIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid receiver ID", http.StatusBadRequest)
		return
	}

	if senderID == receiverID {
		http.Error(w, "Cannot send message to yourself", http.StatusBadRequest)
		return
	}

	// Check if receiver exists
	var receiverExists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", receiverID).Scan(&receiverExists)
	if err != nil || !receiverExists {
		http.Error(w, "Receiver not found", http.StatusNotFound)
		return
	}

	// Check if users can message each other
	canMessage, err := checkCanMessage(senderID, receiverID)
	if err != nil {
		http.Error(w, "Database error checking follow relationship", http.StatusInternalServerError)
		return
	}
	if !canMessage {
		http.Error(w, "You can only message users you follow or who follow you", http.StatusForbidden)
		return
	}

	var req models.SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Content == "" {
		http.Error(w, "Message content cannot be empty", http.StatusBadRequest)
		return
	}

	now := time.Now()

	// Start transaction
	tx, err := database.DB.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Insert message
	res, err := tx.Exec(`
		INSERT INTO private_messages (sender_id, receiver_id, content, created_at)
		VALUES (?, ?, ?, ?)
	`, senderID, receiverID, req.Content, now)
	if err != nil {
		http.Error(w, "Failed to send message", http.StatusInternalServerError)
		return
	}
	messageID, _ := res.LastInsertId()

	// Update or create conversation
	user1ID, user2ID := senderID, receiverID
	if user1ID > user2ID {
		user1ID, user2ID = user2ID, user1ID
	}

	_, err = tx.Exec(`
		INSERT INTO conversations (user1_id, user2_id, last_message_id, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(user1_id, user2_id) DO UPDATE SET
		last_message_id = excluded.last_message_id,
		updated_at = excluded.updated_at
	`, user1ID, user2ID, messageID, now)
	if err != nil {
		http.Error(w, "Failed to update conversation", http.StatusInternalServerError)
		return
	}

	if err = tx.Commit(); err != nil {
		http.Error(w, "Failed to commit transaction", http.StatusInternalServerError)
		return
	}

	// Get sender username and avatar for the broadcast, using COALESCE for avatar
	var senderUsername, senderAvatar string
	err = database.DB.QueryRow("SELECT username, COALESCE(avatar, '') FROM users WHERE id = ?", senderID).Scan(&senderUsername, &senderAvatar)
	if err != nil {
		log.Printf("Error getting sender username/avatar: %v", err)
		senderUsername = "Unknown"
		senderAvatar = ""
	}
	// Ensure avatar URL is absolute if needed
	if senderAvatar != "" && !strings.HasPrefix(senderAvatar, "http") {
		senderAvatar = fmt.Sprintf("http://localhost:8080/%s", strings.TrimLeft(senderAvatar, "/"))
	}

	// Create message response for broadcasts, now including sender_avatar
	messageResponse := map[string]interface{}{
		"id":                messageID,
		"sender_id":         senderID,
		"receiver_id":       receiverID,
		"sender_username":   senderUsername,
		"sender_avatar":     senderAvatar,
		"content":           req.Content,
		"is_read":           false,
		"created_at":        now,
		"is_sent_by_viewer": false,
	}

	// 1. MESSAGE DELIVERY CONFIRMATION
	// Check if receiver is online for delivery status
	isReceiverOnline := IsUserOnline(receiverID)
	log.Printf("Message delivery status - Receiver %d online: %v", receiverID, isReceiverOnline)

	// 2. REAL-TIME MESSAGE DELIVERY
	// Check if receiver should get instant message based on rules:
	// - Receiver is following sender, OR
	// - Receiver has public profile
	shouldReceiveInstant, err := checkShouldReceiveInstantMessage(senderID, receiverID)
	if err != nil {
		log.Printf("Error checking instant message delivery rules: %v", err)
		shouldReceiveInstant = false // Default to not delivering instantly on error
	}
	log.Printf("Message delivery rules - Should receive instant: %v", shouldReceiveInstant)

	// Broadcast to receiver if online AND should receive instant messages
	if isReceiverOnline && shouldReceiveInstant {
		log.Printf("Sending instant message to user %d", receiverID)
		BroadcastToUser(receiverID, "new_message", messageResponse)

		// Send delivery confirmation to sender
		BroadcastToUser(senderID, "message_delivered", map[string]interface{}{
			"message_id":   messageID,
			"delivered_to": receiverID,
			"delivered_at": now,
			"status":       "delivered",
		})

		// NOTE: Do NOT send popup notification for instant messages to avoid duplication
		// The frontend will handle popups appropriately when receiving new_message
	} else {
		// 3. OFFLINE MESSAGE NOTIFICATION OR DELIVERY DELAYED
		// Send popup notification via WebSocket for offline users or delayed delivery
		var notificationMessage string
		if !shouldReceiveInstant {
			notificationMessage = fmt.Sprintf("You have a new message from %s (delayed delivery)", senderUsername)
		} else {
			notificationMessage = fmt.Sprintf("You have a new message from %s", senderUsername)
		}

		// Get sender username and avatar for popup notification, using COALESCE for avatar
		var senderUsernamePopup, senderAvatarPopup string
		err = database.DB.QueryRow("SELECT username, COALESCE(avatar, '') FROM users WHERE id = ?", senderID).Scan(&senderUsernamePopup, &senderAvatarPopup)
		if err != nil {
			log.Printf("Error getting sender username/avatar for popup: %v", err)
			senderUsernamePopup = senderUsername // fallback
			senderAvatarPopup = ""
		}
		// If avatar is a base64 data URL, use as is; otherwise, ensure absolute URL if needed
		if senderAvatarPopup != "" && !strings.HasPrefix(senderAvatarPopup, "http") && !strings.HasPrefix(senderAvatarPopup, "data:image/") {
			senderAvatarPopup = fmt.Sprintf("http://localhost:8080/%s", strings.TrimLeft(senderAvatarPopup, "/"))
		}
		// Debug log for avatar value used in popup
		log.Printf("Popup sender avatar for user %d: %s", senderID, senderAvatarPopup)
		// Send popup message notification via WebSocket (separate from general notifications)
		log.Printf("Sending popup notification to user %d for offline/delayed message", receiverID)
		BroadcastToUser(receiverID, "new_message_popup", map[string]interface{}{
			"sender_id":       senderID,
			"sender_username": senderUsernamePopup,
			"sender_avatar":   senderAvatarPopup,
			"message":         notificationMessage,
			"message_id":      messageID,
			"content":         req.Content,
			"created_at":      now,
		})
	}

	// 3. CONVERSATION LIST UPDATE
	// Broadcast conversation update to receiver
	BroadcastToUser(receiverID, "conversation_updated", map[string]interface{}{
		"sender_id":       senderID,
		"sender_username": senderUsername,
		"last_message":    req.Content,
		"message_time":    now,
		"unread_count":    1, // Increment unread count
	})

	// Response to sender
	deliveryInfo := "sent"
	if isReceiverOnline && shouldReceiveInstant {
		deliveryInfo = "delivered_instantly"
	} else if isReceiverOnline && !shouldReceiveInstant {
		deliveryInfo = "delivered_delayed"
	} else {
		deliveryInfo = "offline_notification_created"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message_id":       messageID,
		"message":          "Message sent successfully",
		"delivery_status":  deliveryInfo,
		"delivered":        isReceiverOnline && shouldReceiveInstant,
		"instant_delivery": shouldReceiveInstant,
	})
}

// GET /conversations - Get all conversations for the authenticated user
func GetConversationsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
        SELECT c.id, c.user1_id, c.user2_id, c.last_message_id, c.updated_at,
               u.username, COALESCE(u.avatar, '') as avatar,
               COALESCE(pm.content, '') as last_message_content,
               COALESCE(pm.created_at, c.updated_at) as last_message_time,
               COALESCE(unread.count, 0) as unread_count
        FROM conversations c
        JOIN users u ON (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END) = u.id
        LEFT JOIN private_messages pm ON c.last_message_id = pm.id
        LEFT JOIN (
            SELECT receiver_id, sender_id, COUNT(*) as count
            FROM private_messages
            WHERE receiver_id = ? AND is_read = FALSE
            GROUP BY sender_id
        ) unread ON unread.sender_id = (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END)
        WHERE c.user1_id = ? OR c.user2_id = ?
        ORDER BY c.updated_at DESC
    `

	rows, err := database.DB.Query(query, userID, userID, userID, userID, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error fetching conversations for user %d: %v", userID, err)
		return
	}
	defer rows.Close()

	var conversations []models.ConversationResponse
	for rows.Next() {
		var c models.ConversationResponse
		var lastMessageTime sql.NullTime
		var lastMessageContent sql.NullString
		var conversationID int64
		var user1ID, user2ID int64
		var updatedAt time.Time

		err := rows.Scan(
			&conversationID, &user1ID, &user2ID, &c.OtherUserID, &updatedAt,
			&c.OtherUsername, &c.OtherUserAvatar,
			&lastMessageContent, &lastMessageTime, &c.UnreadCount,
		)
		if err != nil {
			log.Printf("Error scanning conversation: %v", err)
			continue
		}

		c.ID = conversationID
		if user1ID == userID {
			c.OtherUserID = user2ID
		} else {
			c.OtherUserID = user1ID
		}

		if lastMessageContent.Valid {
			c.LastMessageText = lastMessageContent.String
		}
		if lastMessageTime.Valid {
			c.LastMessageTime = &lastMessageTime.Time
		}

		// Add online status
		c.IsOnline = IsUserOnline(c.OtherUserID)

		conversations = append(conversations, c)
	}

	if conversations == nil {
		conversations = []models.ConversationResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conversations)
}

// GetUnreadMessagesCountHandler returns the total count of unread messages for a user
// Removed: GetUnreadMessagesCountHandler (moved to new message notification handler file)

// BroadcastUnreadMessageCountToUser sends updated unread message count via WebSocket
// Removed: BroadcastUnreadMessageCountToUser (moved to new message notification handler file)

// GET /chat/users - Get users that can be chatted with (following or being followed)
func GetChattableUsersHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Query to get users that the current user is following OR users that are following the current user
	// This includes mutual follows and one-way follows in either direction
	// Ordered by most recent message first
	query := `
		SELECT DISTINCT u.id, u.username, 
			   COALESCE(u.first_name, '') as first_name,
			   COALESCE(u.last_name, '') as last_name,
			   COALESCE(u.avatar, '') as avatar,
			   CASE 
				   WHEN f1.follower_id IS NOT NULL AND f2.follower_id IS NOT NULL THEN 'mutual'
				   WHEN f1.follower_id IS NOT NULL THEN 'following'
				   WHEN f2.follower_id IS NOT NULL THEN 'follower'
				   ELSE 'none'
			   END as relationship_status,
			   COALESCE(latest_msg.latest_created_at, '1970-01-01 00:00:00') as last_message_time
		FROM users u
		LEFT JOIN followers f1 ON u.id = f1.followed_id AND f1.follower_id = ? AND f1.status = 'accept'
		LEFT JOIN followers f2 ON u.id = f2.follower_id AND f2.followed_id = ? AND f2.status = 'accept'
		LEFT JOIN (
			SELECT 
				CASE 
					WHEN sender_id = ? THEN receiver_id 
					ELSE sender_id 
				END as other_user_id,
				MAX(created_at) as latest_created_at
			FROM private_messages 
			WHERE sender_id = ? OR receiver_id = ?
			GROUP BY other_user_id
		) latest_msg ON u.id = latest_msg.other_user_id
		WHERE (f1.follower_id IS NOT NULL OR f2.follower_id IS NOT NULL)
		  AND u.id != ?
		ORDER BY 
			latest_msg.latest_created_at DESC NULLS LAST,
			relationship_status DESC,
			u.first_name, u.last_name, u.username
	`

	rows, err := database.DB.Query(query, userID, userID, userID, userID, userID, userID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error fetching chattable users for user %d: %v", userID, err)
		return
	}
	defer rows.Close()

	var chattableUsers []map[string]interface{}
	for rows.Next() {
		var user map[string]interface{} = make(map[string]interface{})
		var id int64
		var username, firstName, lastName, avatar, relationshipStatus, lastMessageTime string

		err := rows.Scan(&id, &username, &firstName, &lastName, &avatar, &relationshipStatus, &lastMessageTime)
		if err != nil {
			log.Printf("Error scanning chattable user: %v", err)
			continue
		}

		user["id"] = id
		user["username"] = username
		user["first_name"] = firstName
		user["last_name"] = lastName
		user["avatar"] = avatar
		user["relationship_status"] = relationshipStatus
		user["last_message_time"] = lastMessageTime
		user["is_online"] = IsUserOnline(id) // Check online status from WebSocket connections

		// Create display name
		displayName := username
		if firstName != "" || lastName != "" {
			displayName = firstName
			if lastName != "" {
				if firstName != "" {
					displayName += " " + lastName
				} else {
					displayName = lastName
				}
			}
		}
		user["display_name"] = displayName

		chattableUsers = append(chattableUsers, user)
	}

	if err = rows.Err(); err != nil {
		http.Error(w, "Error iterating chattable users", http.StatusInternalServerError)
		log.Printf("Error iterating chattable users for user %d: %v", userID, err)
		return
	}

	if chattableUsers == nil {
		chattableUsers = []map[string]interface{}{}
	}

	// Sort by online status first, then by relationship status
	// Note: Since we can't easily sort in SQL with the IsUserOnline function,
	// we'll handle basic sorting in the query and let the frontend handle advanced sorting if needed

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chattableUsers)
}

// GET /messages/{otherUserID} - Get messages between authenticated user and another user
func GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	otherUserIDStr := r.PathValue("otherUserID")
	otherUserID, err := strconv.ParseInt(otherUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Check if users can message each other
	canMessage, err := checkCanMessage(userID, otherUserID)
	if err != nil {
		http.Error(w, "Database error checking follow relationship", http.StatusInternalServerError)
		return
	}
	if !canMessage {
		http.Error(w, "You can only view messages with users you follow or who follow you", http.StatusForbidden)
		return
	}

	// Pagination: limit and offset
	limit := 10
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	// Mark messages from other user as read and get their IDs for read receipts
	var readMessageIDs []int64
	readRows, err := database.DB.Query(`
		SELECT id FROM private_messages 
		WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
	`, otherUserID, userID)
	if err == nil {
		defer readRows.Close()
		for readRows.Next() {
			var msgID int64
			if readRows.Scan(&msgID) == nil {
				readMessageIDs = append(readMessageIDs, msgID)
			}
		}
	}

	// Mark messages as read
	_, err = database.DB.Exec(`
		UPDATE private_messages 
		SET is_read = TRUE 
		WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
	`, otherUserID, userID)
	if err != nil {
		log.Printf("Error marking messages as read: %v", err)
	}

	// Send read receipts for each message that was just marked as read
	for _, msgID := range readMessageIDs {
		BroadcastToUser(otherUserID, "message_read", map[string]interface{}{
			"message_id": msgID,
			"read_by":    userID,
			// Removed 'read_at' field since it does not exist in the database
		})
	}

	// Fetch messages with pagination
	query := `
        SELECT pm.id, pm.sender_id, pm.receiver_id, pm.content, pm.is_read, pm.created_at,
               u.username
        FROM private_messages pm
        JOIN users u ON pm.sender_id = u.id
        WHERE (pm.sender_id = ? AND pm.receiver_id = ?) 
           OR (pm.sender_id = ? AND pm.receiver_id = ?)
        ORDER BY pm.created_at DESC
        LIMIT ? OFFSET ?
    `

	rows, err := database.DB.Query(query, userID, otherUserID, otherUserID, userID, limit, offset)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		log.Printf("Error fetching messages between %d and %d: %v", userID, otherUserID, err)
		return
	}
	defer rows.Close()

	var messages []models.MessageResponse
	for rows.Next() {
		var m models.MessageResponse
		err := rows.Scan(
			&m.ID, &m.SenderID, &m.ReceiverID, &m.Content,
			&m.IsRead, &m.CreatedAt, &m.SenderUsername,
		)
		if err != nil {
			log.Printf("Error scanning message: %v", err)
			continue
		}
		m.IsSentByViewer = m.SenderID == userID
		messages = append(messages, m)
	}

	if messages == nil {
		messages = []models.MessageResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// PATCH /messages/{messageID}/read - Mark a message as read
func MarkMessageAsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	messageIDStr := r.PathValue("messageID")
	messageID, err := strconv.ParseInt(messageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid message ID", http.StatusBadRequest)
		return
	}

	// Get sender ID before marking as read
	var senderID int64
	err = database.DB.QueryRow("SELECT sender_id FROM private_messages WHERE id = ? AND receiver_id = ?", messageID, userID).Scan(&senderID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Message not found or not authorized", http.StatusNotFound)
		} else {
			http.Error(w, "Database error", http.StatusInternalServerError)
		}
		return
	}

	res, err := database.DB.Exec(`
        UPDATE private_messages 
        SET is_read = TRUE 
        WHERE id = ? AND receiver_id = ?
    `, messageID, userID)
	if err != nil {
		http.Error(w, "Failed to mark message as read", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "Message not found or not authorized", http.StatusNotFound)
		return
	}

	// Send read receipt to sender
	BroadcastToUser(senderID, "message_read", map[string]interface{}{
		"message_id": messageID,
		"read_by":    userID,
		// Removed 'read_at' field since it does not exist in the database
	})

	// Removed: Broadcast updated unread message count to receiver (moved to new message notification handler file)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Message marked as read"})
}

// POST /messages/typing - Send typing indicator
func SendTypingIndicatorHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ReceiverID int64 `json:"receiver_id"`
		IsTyping   bool  `json:"is_typing"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Check if users can message each other
	canMessage, err := checkCanMessage(userID, req.ReceiverID)
	if err != nil {
		http.Error(w, "Database error checking follow relationship", http.StatusInternalServerError)
		return
	}
	if !canMessage {
		http.Error(w, "You can only send typing indicators to users you follow or who follow you", http.StatusForbidden)
		return
	}

	// Get sender username
	var senderUsername string
	err = database.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&senderUsername)
	if err != nil {
		log.Printf("Error getting sender username: %v", err)
		senderUsername = "Unknown"
	}

	// Broadcast typing indicator to receiver
	BroadcastToUser(req.ReceiverID, "typing_indicator", map[string]interface{}{
		"sender_id":       userID,
		"sender_username": senderUsername,
		"is_typing":       req.IsTyping,
		"timestamp":       time.Now(),
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Typing indicator sent"})
}

// GET /users/online-status - Get online status of multiple users
func GetUsersOnlineStatusHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get user IDs from query parameter
	userIDsStr := r.URL.Query().Get("user_ids")
	if userIDsStr == "" {
		http.Error(w, "user_ids parameter is required", http.StatusBadRequest)
		return
	}

	// Parse comma-separated user IDs
	userIDsStrSlice := strings.Split(userIDsStr, ",")
	var userIDs []int64
	for _, idStr := range userIDsStrSlice {
		if id, err := strconv.ParseInt(strings.TrimSpace(idStr), 10, 64); err == nil {
			userIDs = append(userIDs, id)
		}
	}

	if len(userIDs) == 0 {
		http.Error(w, "No valid user IDs provided", http.StatusBadRequest)
		return
	}

	// Check online status for each user
	onlineStatus := make(map[int64]bool)
	for _, targetUserID := range userIDs {
		onlineStatus[targetUserID] = IsUserOnline(targetUserID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"online_status": onlineStatus,
		"timestamp":     time.Now(),
	})
}

// GET /users/{userID}/online-status - Get online status of a specific user
func GetUserOnlineStatusHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetUserIDStr := r.PathValue("userID")
	targetUserID, err := strconv.ParseInt(targetUserIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	// Check if target user exists
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)", targetUserID).Scan(&exists)
	if err != nil || !exists {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	isOnline := IsUserOnline(targetUserID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":   targetUserID,
		"is_online": isOnline,
		"timestamp": time.Now(),
	})
}
