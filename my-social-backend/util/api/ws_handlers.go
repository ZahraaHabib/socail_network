package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/util"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for dev (restrict in production)
	},
}

// Store active WebSocket connections per user
var (
	activeConnections = make(map[int64]*websocket.Conn)
	connectionsMutex  sync.RWMutex
)

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	// Try to get session token from query string for local dev
	userID := int64(0)
	token := r.URL.Query().Get("token")
	if token != "" {
		userID = util.GetUserIDFromSession(token)
	}
	if userID == 0 {
		// Fallback to context (cookie/session)
		ctxUserID, ok := r.Context().Value(middleware.UserIDKey).(int64)
		if ok {
			userID = ctxUserID
		}
	}
	if userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Store connection
	connectionsMutex.Lock()
	activeConnections[userID] = conn
	connectionsMutex.Unlock()

	log.Printf("User %d connected via WebSocket", userID)

	// Broadcast online status to connected followers/following
	BroadcastUserStatusChange(userID, true)

	// Clean up on disconnect
	defer func() {
		connectionsMutex.Lock()
		delete(activeConnections, userID)
		connectionsMutex.Unlock()
		log.Printf("User %d disconnected from WebSocket", userID)

		// Broadcast offline status to connected followers/following
		BroadcastUserStatusChange(userID, false)
	}()

	// Send welcome message
	welcomeMsg := WSMessage{
		Type: "connected",
		Data: map[string]string{"status": "connected"},
	}
	conn.WriteJSON(welcomeMsg)

	deliverUnreadDirectMessages(userID, conn)
	// Check for unread message notifications (group, etc.)
	checkAndSendOfflineMessageNotifications(userID, conn)

	// Listen for messages from client
	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("WebSocket read error for user %d: %v", userID, err)
			break
		}

		// Handle different message types
		switch msg.Type {
		case "direct_message":
			// Handle direct user-to-user messaging
			var req struct {
				ReceiverID int64  `json:"receiver_id"`
				Content    string `json:"content"`
			}
			msgData, err := json.Marshal(msg.Data)
			if err != nil {
				log.Printf("Error marshaling direct message data: %v", err)
				continue
			}
			if err := json.Unmarshal(msgData, &req); err != nil {
				log.Printf("Error unmarshaling direct message: %v", err)
				continue
			}
			if req.Content == "" {
				conn.WriteJSON(WSMessage{Type: "error", Data: "Message content cannot be empty"})
				continue
			}
			// Save message to database
			now := time.Now()
			result, err := database.DB.Exec(`INSERT INTO private_messages (sender_id, receiver_id, content, created_at) VALUES (?, ?, ?, ?)`, userID, req.ReceiverID, req.Content, now)
			if err != nil {
				log.Printf("Error saving direct message: %v", err)
				conn.WriteJSON(WSMessage{Type: "error", Data: "Failed to save message"})
				continue
			}
			messageID, _ := result.LastInsertId()
			// Get sender username
			var username string
			err = database.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
			if err != nil {
				log.Printf("Error getting username: %v", err)
				username = "Unknown"
			}
			// Prepare message payload
			response := map[string]interface{}{
				"id":          messageID,
				"sender_id":   userID,
				"receiver_id": req.ReceiverID,
				"username":    username,
				"content":     req.Content,
				"created_at":  now,
			}
			// Broadcast to receiver
			BroadcastToUser(req.ReceiverID, "direct_message", response)
			// Send confirmation to sender
			conn.WriteJSON(WSMessage{Type: "direct_message_sent", Data: response})
		case "typing_indicator":
			// Broadcast typing status to the other user in the conversation
			var req struct {
				ReceiverID int64 `json:"receiver_id"`
				IsTyping   bool  `json:"is_typing"`
			}
			msgData, err := json.Marshal(msg.Data)
			if err == nil {
				if err := json.Unmarshal(msgData, &req); err == nil {
					BroadcastToUser(req.ReceiverID, "typing_indicator", map[string]interface{}{
						"sender_id": userID,
						"is_typing": req.IsTyping,
					})
				}
			}

		case "message_read":
			// Update message as read and notify sender
			var req struct {
				MessageID int64 `json:"message_id"`
			}
			msgData, err := json.Marshal(msg.Data)
			if err == nil {
				if err := json.Unmarshal(msgData, &req); err == nil {
					// Update DB for read status
					_, err := database.DB.Exec(`UPDATE private_messages SET is_read = 1 WHERE id = ?`, req.MessageID)
					if err == nil {
						// Optionally notify sender
						BroadcastToUser(userID, "message_read", map[string]interface{}{
							"message_id": req.MessageID,
							"read_at":    time.Now(),
						})
					}
				}
			}

		case "heartbeat":
			// Optionally update last-seen or keep connection alive
			// You can update a last-seen timestamp in DB if needed
			// For now, just acknowledge
			conn.WriteJSON(WSMessage{Type: "heartbeat_ack", Data: "ok"})

		case "open_conversation":
			// Mark conversation as open for this user (for instant delivery/read)
			// You can store this state in memory or DB if needed
			// For now, just acknowledge
			conn.WriteJSON(WSMessage{Type: "open_conversation_ack", Data: "ok"})
		case "ping":
			conn.WriteJSON(WSMessage{Type: "pong", Data: "pong"})

		case "request_online_status":
			sendOnlineStatusToUser(userID, conn)

		case "group_message":
			var req struct {
				GroupID int64  `json:"group_id"`
				Content string `json:"content"`
			}

			// Parse the message data
			msgData, err := json.Marshal(msg.Data)
			if err != nil {
				log.Printf("Error marshaling message data: %v", err)
				continue
			}

			if err := json.Unmarshal(msgData, &req); err != nil {
				log.Printf("Error unmarshaling group message: %v", err)
				continue
			}

			// Validate user is group member
			var isMember bool
			err = database.DB.QueryRow(`
                SELECT EXISTS(
                    SELECT 1 FROM group_members 
                    WHERE group_id = ? AND user_id = ? AND status = 'accepted'
                )
            `, req.GroupID, userID).Scan(&isMember)

			if err != nil || !isMember {
				conn.WriteJSON(WSMessage{Type: "error", Data: "Not a group member"})
				continue
			}

			// Validate content
			if req.Content == "" {
				conn.WriteJSON(WSMessage{Type: "error", Data: "Message content cannot be empty"})
				continue
			}

			// Save message to database
			now := time.Now()
			result, err := database.DB.Exec(`
                INSERT INTO group_chat_messages (group_id, sender_id, content, created_at)
                VALUES (?, ?, ?, ?)
            `, req.GroupID, userID, req.Content, now)

			if err != nil {
				log.Printf("Error saving group message: %v", err)
				conn.WriteJSON(WSMessage{Type: "error", Data: "Failed to save message"})
				continue
			}

			messageID, _ := result.LastInsertId()

			// Get sender username
			var username string
			err = database.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&username)
			if err != nil {
				log.Printf("Error getting username: %v", err)
				username = "Unknown"
			}

			// Prepare message payload
			response := map[string]interface{}{
				"id":         messageID,
				"group_id":   req.GroupID,
				"sender_id":  userID,
				"username":   username,
				"content":    req.Content,
				"created_at": now,
			}

			// Broadcast the message to all group members except sender
			BroadcastToGroup(req.GroupID, "group_message", response, &userID)

			// Broadcast a group message notification to all other online group members
			go func() {
				// Get all group members except sender
				rows, err := database.DB.Query(`
					   SELECT user_id FROM group_members 
					   WHERE group_id = ? AND status = 'accepted' AND user_id != ?
				   `, req.GroupID, userID)
				if err != nil {
					log.Printf("Error getting group members for notification: %v", err)
					return
				}
				defer rows.Close()
				for rows.Next() {
					var memberID int64
					if err := rows.Scan(&memberID); err != nil {
						continue
					}
					// Only notify if online
					if IsUserOnline(memberID) {
						BroadcastToUser(memberID, "group_message_notification", map[string]interface{}{
							"group_id":         req.GroupID,
							"group_message_id": messageID,
							"sender_id":        userID,
							"sender_username":  username,
							"content":          req.Content,
							"created_at":       now,
						})
					}
				}
			}()

			// Send confirmation to sender
			conn.WriteJSON(WSMessage{Type: "group_message_sent", Data: response})

		default:
			log.Printf("Unknown message type from user %d: %s", userID, msg.Type)
		}
	}
}

// Broadcast message to a specific user
func BroadcastToUser(receiverID int64, msgType string, data interface{}) {
	connectionsMutex.RLock()
	conn, exists := activeConnections[receiverID]
	connectionsMutex.RUnlock()

	if exists {
		msg := WSMessage{
			Type: msgType,
			Data: data,
		}
		err := conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Error broadcasting to user %d: %v", receiverID, err)
			// Remove dead connection
			connectionsMutex.Lock()
			delete(activeConnections, receiverID)
			connectionsMutex.Unlock()
		}
	}
}

// Broadcast message to all members of a group
func BroadcastToGroup(groupID int64, msgType string, data interface{}, excludeUserID *int64) {
	// Get all group members
	rows, err := database.DB.Query(`
        SELECT user_id FROM group_members 
        WHERE group_id = ? AND status = 'accepted'
    `, groupID)
	if err != nil {
		log.Printf("Error getting group members: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var memberID int64
		if err := rows.Scan(&memberID); err != nil {
			continue
		}

		// Skip sender if specified
		if excludeUserID != nil && memberID == *excludeUserID {
			continue
		}

		BroadcastToUser(memberID, msgType, data)
	}
}

// Get online users count (optional utility)
func GetOnlineUsersCount() int {
	connectionsMutex.RLock()
	defer connectionsMutex.RUnlock()
	return len(activeConnections)
}

// Check if user is online
func IsUserOnline(userID int64) bool {
	connectionsMutex.RLock()
	defer connectionsMutex.RUnlock()
	_, exists := activeConnections[userID]
	return exists
}

// Get list of online group members
func GetOnlineGroupMembers(groupID int64) []int64 {
	rows, err := database.DB.Query(`
        SELECT user_id FROM group_members 
        WHERE group_id = ? AND status = 'accepted'
    `, groupID)
	if err != nil {
		log.Printf("Error getting group members: %v", err)
		return nil
	}
	defer rows.Close()

	var onlineMembers []int64
	connectionsMutex.RLock()
	defer connectionsMutex.RUnlock()

	for rows.Next() {
		var memberID int64
		if err := rows.Scan(&memberID); err != nil {
			continue
		}

		// Check if member is online
		if _, exists := activeConnections[memberID]; exists {
			onlineMembers = append(onlineMembers, memberID)
		}
	}

	return onlineMembers
}

// checkAndSendOfflineMessageNotifications checks for unread message notifications and sends them to the user
func checkAndSendOfflineMessageNotifications(userID int64, conn *websocket.Conn) {
	// Query for unread message notifications
	query := `
        SELECT COUNT(*) as count, GROUP_CONCAT(n.actor_id) as sender_ids
        FROM notifications n
        WHERE n.user_id = ? AND n.type = 'new_message' AND n.is_read = FALSE
    `

	var count int
	var senderIDs sql.NullString
	err := database.DB.QueryRow(query, userID).Scan(&count, &senderIDs)
	if err != nil {
		log.Printf("Error checking offline message notifications for user %d: %v", userID, err)
		return
	}

	if count > 0 {
		// Send offline message notification
		notification := WSMessage{
			Type: "offline_messages_notification",
			Data: map[string]interface{}{
				"count":     count,
				"message":   fmt.Sprintf("You have %d new message(s) while you were offline", count),
				"timestamp": time.Now(),
			},
		}

		err := conn.WriteJSON(notification)
		if err != nil {
			log.Printf("Error sending offline message notification to user %d: %v", userID, err)
		}

		// Mark message notifications as read since user is now online
		_, err = database.DB.Exec(`
            UPDATE notifications 
            SET is_read = TRUE 
            WHERE user_id = ? AND type = 'new_message' AND is_read = FALSE
        `, userID)
		if err != nil {
			log.Printf("Error marking message notifications as read for user %d: %v", userID, err)
		}
	}
}

// BroadcastUserStatusChange broadcasts online/offline status to connected followers and following
func BroadcastUserStatusChange(userID int64, isOnline bool) {
	// Get all users who follow this user or are followed by this user
	var connectedUserIDs []int64

	// Get followers (who should know when this user comes online)
	followerRows, err := database.DB.Query(`
		SELECT f.follower_id 
		FROM followers f 
		WHERE f.followed_id = ? AND f.status = 'accept'
	`, userID)
	if err != nil {
		log.Printf("Error fetching followers for status broadcast: %v", err)
		return
	}
	defer followerRows.Close()

	for followerRows.Next() {
		var followerID int64
		if err := followerRows.Scan(&followerID); err == nil {
			connectedUserIDs = append(connectedUserIDs, followerID)
		}
	}

	// Get following (who should know when this user comes online)
	followingRows, err := database.DB.Query(`
		SELECT f.followed_id 
		FROM followers f 
		WHERE f.follower_id = ? AND f.status = 'accept'
	`, userID)
	if err != nil {
		log.Printf("Error fetching following for status broadcast: %v", err)
		return
	}
	defer followingRows.Close()

	for followingRows.Next() {
		var followedID int64
		if err := followingRows.Scan(&followedID); err == nil {
			connectedUserIDs = append(connectedUserIDs, followedID)
		}
	}

	// Broadcast status change to connected users
	statusMessage := "user_online"
	if !isOnline {
		statusMessage = "user_offline"
	}

	for _, targetUserID := range connectedUserIDs {
		BroadcastToUser(targetUserID, statusMessage, map[string]interface{}{
			"user_id": userID,
		})
	}

	log.Printf("Broadcasted %s status for user %d to %d connected users", statusMessage, userID, len(connectedUserIDs))
}

// sendOnlineStatusToUser sends current online status of all chattable users to a specific user
func sendOnlineStatusToUser(userID int64, conn *websocket.Conn) {
	// Get all users this user can chat with (mutual follows, followers, following)
	var chattableUserIDs []int64

	// Get followers
	followerRows, err := database.DB.Query(`
		SELECT f.follower_id 
		FROM followers f 
		WHERE f.followed_id = ? AND f.status = 'accept'
	`, userID)
	if err != nil {
		log.Printf("Error fetching followers for online status: %v", err)
		return
	}
	defer followerRows.Close()

	for followerRows.Next() {
		var followerID int64
		if err := followerRows.Scan(&followerID); err == nil {
			chattableUserIDs = append(chattableUserIDs, followerID)
		}
	}

	// Get following
	followingRows, err := database.DB.Query(`
		SELECT f.followed_id 
		FROM followers f 
		WHERE f.follower_id = ? AND f.status = 'accept'
	`, userID)
	if err != nil {
		log.Printf("Error fetching following for online status: %v", err)
		return
	}
	defer followingRows.Close()

	for followingRows.Next() {
		var followedID int64
		if err := followingRows.Scan(&followedID); err == nil {
			chattableUserIDs = append(chattableUserIDs, followedID)
		}
	}

	// Check which of these users are currently online
	connectionsMutex.RLock()
	var onlineUserIDs []int64
	for _, chattableUserID := range chattableUserIDs {
		if _, isOnline := activeConnections[chattableUserID]; isOnline {
			onlineUserIDs = append(onlineUserIDs, chattableUserID)
		}
	}
	connectionsMutex.RUnlock()

	// Send online status for each online user
	for _, onlineUserID := range onlineUserIDs {
		statusMsg := WSMessage{
			Type: "user_online",
			Data: map[string]interface{}{
				"user_id": onlineUserID,
			},
		}
		if err := conn.WriteJSON(statusMsg); err != nil {
			log.Printf("Error sending online status to user %d: %v", userID, err)
			break
		}
	}
}

// BroadcastLikeUpdate broadcasts the updated like/dislike counts for a post to all connected users
func BroadcastLikeUpdate(postID int64, likeCount, dislikeCount int) {
	msg := WSMessage{
		Type: "post_like_updated",
		Data: map[string]interface{}{
			"post_id":       postID,
			"like_count":    likeCount,
			"dislike_count": dislikeCount,
		},
	}

	connectionsMutex.RLock()
	defer connectionsMutex.RUnlock()
	for userID, conn := range activeConnections {
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("Error broadcasting like update to user %d: %v", userID, err)
		}
	}
}

// Deliver unread direct messages to user when they reconnect
func deliverUnreadDirectMessages(userID int64, conn *websocket.Conn) {
	query := `SELECT pm.id, pm.sender_id, u.username, pm.content, pm.created_at FROM private_messages pm JOIN users u ON pm.sender_id = u.id WHERE pm.receiver_id = ? AND pm.is_read = 0 ORDER BY pm.created_at ASC`
	rows, err := database.DB.Query(query, userID)
	if err != nil {
		log.Printf("Error fetching unread direct messages for user %d: %v", userID, err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var messageID, senderID int64
		var username, content string
		var createdAt time.Time
		if err := rows.Scan(&messageID, &senderID, &username, &content, &createdAt); err != nil {
			continue
		}
		msg := WSMessage{
			Type: "direct_message",
			Data: map[string]interface{}{
				"id":         messageID,
				"sender_id":  senderID,
				"username":   username,
				"content":    content,
				"created_at": createdAt,
			},
		}
		// Send each unread message
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("Error delivering offline direct message to user %d: %v", userID, err)
		} else {
			// Mark as read after delivery
			_, err := database.DB.Exec(`UPDATE private_messages SET is_read = 1, read_at = ? WHERE id = ?`, time.Now(), messageID)
			if err != nil {
				log.Printf("Error marking message %d as read: %v", messageID, err)
			}
		}
	}
}
