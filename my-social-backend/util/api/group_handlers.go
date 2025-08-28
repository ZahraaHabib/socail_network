package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/models"
) // POST /groups - create a group
func CreateGroupHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		http.Error(w, "Title is required", http.StatusBadRequest)
		return
	}

	now := time.Now()
	res, err := database.DB.Exec(
		"INSERT INTO groups (title, description, creator_id, created_at) VALUES (?, ?, ?, ?)",
		req.Title, req.Description, userID, now,
	)
	if err != nil {
		http.Error(w, "Failed to create group", http.StatusInternalServerError)
		return
	}
	groupID, _ := res.LastInsertId()
	// Add creator as member
	_, err = database.DB.Exec(
		"INSERT INTO group_members (group_id, user_id, role, status, accepted_at) VALUES (?, ?, 'creator', 'accepted', ?)",
		groupID, userID, now,
	)
	if err != nil {
		http.Error(w, "Failed to add creator as group member", http.StatusInternalServerError)
		return
	}
	// Fetch the full group info to return
	var group struct {
		ID          int64     `json:"id"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		CreatorID   int64     `json:"creator_id"`
		CreatedAt   time.Time `json:"created_at"`
		MemberCount int       `json:"member_count"`
		IsMember    bool      `json:"is_member"`
		CreatorName string    `json:"creator_name"`
	}
	dbQuery := `
		SELECT g.id, g.title, g.description, g.creator_id, g.created_at,
		  (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.status = 'accepted') as member_count,
		  1 as is_member,
		  u.username as creator_name
		FROM groups g
		JOIN users u ON g.creator_id = u.id
		WHERE g.id = ?
	`
	err = database.DB.QueryRow(dbQuery, groupID).Scan(&group.ID, &group.Title, &group.Description, &group.CreatorID, &group.CreatedAt, &group.MemberCount, &group.IsMember, &group.CreatorName)
	if err != nil {
		http.Error(w, "Failed to fetch group info", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(group)
}

// GET /groups - list all groups
func ListGroupsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
		SELECT 
			g.id, 
			g.title, 
			g.description, 
			g.creator_id, 
			g.created_at,
			CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member,
			COUNT(gm2.user_id) as member_count
		FROM groups g
		LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ? AND gm.status = 'accepted'
		LEFT JOIN group_members gm2 ON g.id = gm2.group_id AND gm2.status = 'accepted'
		GROUP BY g.id, g.title, g.description, g.creator_id, g.created_at, gm.user_id
		ORDER BY g.created_at DESC
	`

	rows, err := database.DB.Query(query, userID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var groups []map[string]interface{}
	for rows.Next() {
		var g models.Group
		var isMember int
		var memberCount int
		if err := rows.Scan(&g.ID, &g.Title, &g.Description, &g.CreatorID, &g.CreatedAt, &isMember, &memberCount); err != nil {
			continue
		}

		group := map[string]interface{}{
			"id":           g.ID,
			"title":        g.Title,
			"description":  g.Description,
			"creator_id":   g.CreatorID,
			"created_at":   g.CreatedAt,
			"is_member":    isMember == 1,
			"member_count": memberCount,
		}
		groups = append(groups, group)
	}

	if groups == nil {
		groups = []map[string]interface{}{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// GET /groups/my - list user's groups
func GetMyGroupsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := `
		SELECT g.id, g.title, g.description, g.creator_id, g.created_at,
		  (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.status = 'accepted') as member_count,
		  1 as is_member,
		  u.username as creator_name
		FROM groups g
		JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ? AND gm.status = 'accepted'
		JOIN users u ON g.creator_id = u.id
		ORDER BY g.created_at DESC
	`
	rows, err := database.DB.Query(query, userID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type GroupInfo struct {
		ID          int64     `json:"id"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		CreatorID   int64     `json:"creator_id"`
		CreatedAt   time.Time `json:"created_at"`
		MemberCount int       `json:"member_count"`
		IsMember    bool      `json:"is_member"`
		CreatorName string    `json:"creator_name"`
	}
	var groups []GroupInfo
	for rows.Next() {
		var g GroupInfo
		var isMemberInt int
		if err := rows.Scan(&g.ID, &g.Title, &g.Description, &g.CreatorID, &g.CreatedAt, &g.MemberCount, &isMemberInt, &g.CreatorName); err != nil {
			continue
		}
		g.IsMember = isMemberInt == 1
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []GroupInfo{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// GET /groups/invitations - get pending invitations
func GetPendingInvitationsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	type GroupInvitation struct {
		GroupID     int64     `json:"group_id"`
		GroupTitle  string    `json:"group_title"`
		InviterID   int64     `json:"inviter_id"`
		InviterName string    `json:"inviter_name"`
		InvitedAt   time.Time `json:"invited_at"`
	}

	rows, err := database.DB.Query(`
        SELECT gm.group_id, g.title, gm.invited_by, u.username, gm.invited_at
        FROM group_members gm
        JOIN groups g ON gm.group_id = g.id
        LEFT JOIN users u ON gm.invited_by = u.id
        WHERE gm.user_id = ? AND gm.status = 'invited'
        ORDER BY gm.invited_at DESC
    `, userID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var invitations []GroupInvitation
	for rows.Next() {
		var inv GroupInvitation
		var inviterName sql.NullString
		if err := rows.Scan(&inv.GroupID, &inv.GroupTitle, &inv.InviterID, &inviterName, &inv.InvitedAt); err != nil {
			continue
		}
		if inviterName.Valid {
			inv.InviterName = inviterName.String
		}
		invitations = append(invitations, inv)
	}
	if invitations == nil {
		invitations = []GroupInvitation{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invitations)
}

// GET /groups/{groupID}/members - get group members
func GetGroupMembersHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)

	// Check if user is a member
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}

	type GroupMember struct {
		ID       int64  `json:"id"`
		Username string `json:"username"`
		Role     string `json:"role"`
		Avatar   string `json:"avatar"`
	}

	rows, err := database.DB.Query(`
        SELECT u.id, u.username, gm.role, COALESCE(u.avatar, '') as avatar
        FROM group_members gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ? AND gm.status = 'accepted'
        ORDER BY gm.role DESC, u.username ASC
    `, groupID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var members []GroupMember
	for rows.Next() {
		var m GroupMember
		if err := rows.Scan(&m.ID, &m.Username, &m.Role, &m.Avatar); err != nil {
			continue
		}
		members = append(members, m)
	}
	if members == nil {
		members = []GroupMember{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

// POST /groups/{groupID}/invite - invite a user to group
func InviteToGroupHandler(w http.ResponseWriter, r *http.Request) {
	inviterID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || inviterID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	var req struct {
		UserID int64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	// Check inviter is a member
	var status string
	err := database.DB.QueryRow(
		"SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'",
		groupID, inviterID,
	).Scan(&status)
	if err != nil {
		http.Error(w, "Only group members can invite", http.StatusForbidden)
		return
	}
	now := time.Now()
	// Insert invitation
	_, err = database.DB.Exec(
		"INSERT OR IGNORE INTO group_members (group_id, user_id, role, status, invited_by, invited_at) VALUES (?, ?, 'member', 'invited', ?, ?)",
		groupID, req.UserID, inviterID, now,
	)
	if err != nil {
		http.Error(w, "Failed to invite user", http.StatusInternalServerError)
		return
	}

	// Get group and inviter information for notification
	var groupTitle, inviterUsername string
	err = database.DB.QueryRow(
		"SELECT g.title, u.username FROM groups g, users u WHERE g.id = ? AND u.id = ?",
		groupID, inviterID,
	).Scan(&groupTitle, &inviterUsername)
	if err == nil {
		// Create notification for the invited user
		_, err = database.DB.Exec(`
			INSERT INTO notifications (user_id, type, title, message, related_id, related_type, actor_id, created_at) 
			VALUES (?, 'group_invitation', ?, ?, ?, 'group', ?, ?)`,
			req.UserID,
			"Group Invitation",
			inviterUsername+" invited you to join '"+groupTitle+"'",
			groupID,
			inviterID,
			now,
		)
		// Log error but don't fail the invitation if notification fails
		if err != nil {
			log.Printf("Failed to create notification for group invitation: %v", err)
		}
	}

	w.WriteHeader(http.StatusCreated)
}

// POST /groups/{groupID}/accept-invite - accept invitation
func AcceptGroupInviteHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	now := time.Now()
	res, err := database.DB.Exec(
		"UPDATE group_members SET status = 'accepted', accepted_at = ? WHERE group_id = ? AND user_id = ? AND status = 'invited'",
		now, groupID, userID,
	)
	if err != nil {
		http.Error(w, "Failed to accept invitation", http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, "No pending invitation found", http.StatusBadRequest)
		return
	}

	// Update the group invitation notification to show "accepted"
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Error updating group invitation notification: %v", r)
			}
		}()

		var groupTitle string
		err := database.DB.QueryRow("SELECT title FROM groups WHERE id = ?", groupID).Scan(&groupTitle)
		if err == nil {
			_, err = database.DB.Exec(`
				UPDATE notifications 
				SET type = 'group_invitation_accepted', 
					title = 'Group Invitation Accepted', 
					message = ? 
				WHERE user_id = ? AND type = 'group_invitation' AND related_id = ?`,
				"You accepted the invitation to join '"+groupTitle+"'",
				userID,
				groupID)
			if err != nil {
				log.Printf("Failed to update group invitation notification: %v", err)
			}
		}
	}()

	w.WriteHeader(http.StatusOK)
	// Broadcast new member joined
	go BroadcastToGroup(groupID, "group_member_joined", map[string]interface{}{
		"user_id": userID,
	}, nil)
}

// POST /groups/{groupID}/reject-invite - reject invitation
func RejectGroupInviteHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	res, err := database.DB.Exec(
		"DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'invited'",
		groupID, userID,
	)
	if err != nil {
		http.Error(w, "Failed to reject invitation", http.StatusInternalServerError)
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, "No pending invitation found", http.StatusBadRequest)
		return
	}

	// Update the group invitation notification to show "rejected"
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Error updating group invitation notification: %v", r)
			}
		}()

		var groupTitle string
		err := database.DB.QueryRow("SELECT title FROM groups WHERE id = ?", groupID).Scan(&groupTitle)
		if err == nil {
			_, err = database.DB.Exec(`
				UPDATE notifications 
				SET type = 'group_invitation_rejected', 
					title = 'Group Invitation Rejected', 
					message = ? 
				WHERE user_id = ? AND type = 'group_invitation' AND related_id = ?`,
				"You rejected the invitation to join '"+groupTitle+"'",
				userID,
				groupID)
			if err != nil {
				log.Printf("Failed to update group invitation notification: %v", err)
			}
		}
	}()

	w.WriteHeader(http.StatusOK)
}

// POST /groups/{groupID}/request - request to join group
func RequestToJoinGroupHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	now := time.Now()
	_, err := database.DB.Exec(
		"INSERT OR IGNORE INTO group_members (group_id, user_id, role, status, requested_at) VALUES (?, ?, 'member', 'requested', ?)",
		groupID, userID, now,
	)
	if err != nil {
		http.Error(w, "Failed to request to join group", http.StatusInternalServerError)
		return
	}

	// Get group and requester information for notification to the creator
	var groupTitle, requesterUsername string
	var creatorID int64
	err = database.DB.QueryRow(
		"SELECT g.title, g.creator_id, u.username FROM groups g, users u WHERE g.id = ? AND u.id = ?",
		groupID, userID,
	).Scan(&groupTitle, &creatorID, &requesterUsername)
	if err == nil {
		// Create notification for the group creator
		_, err = database.DB.Exec(`
			INSERT INTO notifications (user_id, type, title, message, related_id, related_type, actor_id, created_at) 
			VALUES (?, 'group_join_request', ?, ?, ?, 'group', ?, ?)`,
			creatorID,
			"Group Join Request",
			requesterUsername+" wants to join '"+groupTitle+"'",
			groupID,
			userID,
			now,
		)
		// Log error but don't fail the request if notification fails
		if err != nil {
			log.Printf("Failed to create notification for group join request: %v", err)
		}
	}

	w.WriteHeader(http.StatusCreated)
}

// POST /groups/{groupID}/handle-request - creator accepts/refuses join request
func HandleJoinRequestHandler(w http.ResponseWriter, r *http.Request) {
	creatorID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || creatorID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	var req struct {
		UserID int64  `json:"user_id"`
		Action string `json:"action"` // "accept" or "refuse"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	// Check creator
	var isCreator bool
	err := database.DB.QueryRow(
		"SELECT EXISTS(SELECT 1 FROM groups WHERE id = ? AND creator_id = ?)",
		groupID, creatorID,
	).Scan(&isCreator)
	if err != nil || !isCreator {
		http.Error(w, "Only group creator can handle requests", http.StatusForbidden)
		return
	}
	switch req.Action {
	case "accept":
		now := time.Now()
		_, err = database.DB.Exec(
			"UPDATE group_members SET status = 'accepted', accepted_at = ? WHERE group_id = ? AND user_id = ? AND status = 'requested'",
			now, groupID, req.UserID,
		)
		if err != nil {
			http.Error(w, "Failed to accept request", http.StatusInternalServerError)
			return
		}

		// Update the group join request notification to show "accepted"
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error updating group join request notification: %v", r)
				}
			}()

			var groupTitle, requesterUsername string
			err1 := database.DB.QueryRow("SELECT title FROM groups WHERE id = ?", groupID).Scan(&groupTitle)
			err2 := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", req.UserID).Scan(&requesterUsername)
			if err1 == nil && err2 == nil {
				_, err = database.DB.Exec(`
					UPDATE notifications 
					SET type = 'group_join_request_accepted', 
						title = 'Group Join Request Accepted', 
						message = ? 
					WHERE user_id = ? AND type = 'group_join_request' AND related_id = ? AND actor_id = ?`,
					"You accepted "+requesterUsername+"'s request to join '"+groupTitle+"'",
					creatorID,
					groupID,
					req.UserID)
				if err != nil {
					log.Printf("Failed to update group join request notification: %v", err)
				}
			}
		}()
	case "refuse":
		_, err = database.DB.Exec(
			"DELETE FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'requested'",
			groupID, req.UserID,
		)
		if err != nil {
			http.Error(w, "Failed to refuse request", http.StatusInternalServerError)
			return
		}

		// Update the group join request notification to show "rejected"
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Error updating group join request notification: %v", r)
				}
			}()

			var groupTitle, requesterUsername string
			err1 := database.DB.QueryRow("SELECT title FROM groups WHERE id = ?", groupID).Scan(&groupTitle)
			err2 := database.DB.QueryRow("SELECT username FROM users WHERE id = ?", req.UserID).Scan(&requesterUsername)
			if err1 == nil && err2 == nil {
				_, err = database.DB.Exec(`
					UPDATE notifications 
					SET type = 'group_join_request_rejected', 
						title = 'Group Join Request Rejected', 
						message = ? 
					WHERE user_id = ? AND type = 'group_join_request' AND related_id = ? AND actor_id = ?`,
					"You rejected "+requesterUsername+"'s request to join '"+groupTitle+"'",
					creatorID,
					groupID,
					req.UserID)
				if err != nil {
					log.Printf("Failed to update group join request notification: %v", err)
				}
			}
		}()
	default:
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// GET /groups/{groupID}/posts - list posts in a group (members only)
// ...existing code...

// GET /groups/{groupID}/posts - list posts in a group (members only)
func ListGroupPostsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}

	// Define a named struct type for the response
	type GroupPostResponse struct {
		ID             int64     `json:"id"`
		UserID         int64     `json:"user_id"`
		AuthorUsername string    `json:"author_username"`
		Content        string    `json:"content"`
		CreatedAt      time.Time `json:"created_at"`
		UpdatedAt      time.Time `json:"updated_at"`
	}

	// Fetch posts
	rows, err := database.DB.Query(`
        SELECT p.id, p.user_id, u.username, p.content, p.created_at, p.updated_at
        FROM group_posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.group_id = ?
        ORDER BY p.created_at DESC
    `, groupID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var posts []GroupPostResponse
	for rows.Next() {
		var p GroupPostResponse
		if err := rows.Scan(&p.ID, &p.UserID, &p.AuthorUsername, &p.Content, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		posts = append(posts, p)
	}
	if posts == nil {
		posts = []GroupPostResponse{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(posts)
}

// POST /groups/{groupID}/posts - create post in group (members only)
func CreateGroupPostHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		http.Error(w, "Invalid content", http.StatusBadRequest)
		return
	}
	now := time.Now()
	res, err := database.DB.Exec(
		"INSERT INTO group_posts (group_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		groupID, userID, req.Content, now, now,
	)
	if err != nil {
		http.Error(w, "Failed to create group post", http.StatusInternalServerError)
		return
	}
	postID, _ := res.LastInsertId()
	w.WriteHeader(http.StatusCreated)
	// Fetch the full post info for broadcast (simplified, add more fields as needed)
	var post struct {
		ID        int64     `json:"id"`
		GroupID   int64     `json:"group_id"`
		UserID    int64     `json:"user_id"`
		Content   string    `json:"content"`
		CreatedAt time.Time `json:"created_at"`
	}
	dbErr := database.DB.QueryRow("SELECT id, group_id, user_id, content, created_at FROM group_posts WHERE id = ?", postID).Scan(&post.ID, &post.GroupID, &post.UserID, &post.Content, &post.CreatedAt)
	if dbErr == nil {
		go BroadcastToGroup(groupID, "group_post_created", post, nil)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"post_id": postID})
}

// GET /groups/{groupID}/posts/{postID}/comments - list comments for a group post (members only)
func ListGroupPostCommentsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	postID, _ := strconv.ParseInt(r.PathValue("postID"), 10, 64)
	rows, err := database.DB.Query(`
        SELECT c.id, c.post_id, c.user_id, u.username, c.content, c.created_at
        FROM group_post_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
    `, postID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var comments []models.CommentResponse
	for rows.Next() {
		var c models.CommentResponse
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.AuthorUsername, &c.Content, &c.CreatedAt); err != nil {
			continue
		}
		comments = append(comments, c)
	}
	if comments == nil {
		comments = []models.CommentResponse{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comments)
}

// POST /groups/{groupID}/posts/{postID}/comments - add comment to group post (members only)
func CreateGroupPostCommentHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	postID, _ := strconv.ParseInt(r.PathValue("postID"), 10, 64)
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		http.Error(w, "Invalid content", http.StatusBadRequest)
		return
	}
	now := time.Now()
	res, err := database.DB.Exec(
		"INSERT INTO group_post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
		postID, userID, req.Content, now,
	)
	if err != nil {
		http.Error(w, "Failed to add comment", http.StatusInternalServerError)
		return
	}
	commentID, _ := res.LastInsertId()
	w.WriteHeader(http.StatusCreated)
	// Fetch the full comment info for broadcast (simplified)
	var comment struct {
		ID        int64     `json:"id"`
		PostID    int64     `json:"post_id"`
		UserID    int64     `json:"user_id"`
		Content   string    `json:"content"`
		CreatedAt time.Time `json:"created_at"`
	}
	dbErr := database.DB.QueryRow("SELECT id, post_id, user_id, content, created_at FROM group_post_comments WHERE id = ?", commentID).Scan(&comment.ID, &comment.PostID, &comment.UserID, &comment.Content, &comment.CreatedAt)
	if dbErr == nil {
		go BroadcastToGroup(groupID, "group_post_comment_created", comment, nil)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"comment_id": commentID})
}

// POST /groups/{groupID}/events - create event (group members only)
func CreateGroupEventHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		EventTime   string `json:"event_time"` // ISO8601 string
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" || req.EventTime == "" {
		http.Error(w, "Invalid event data", http.StatusBadRequest)
		return
	}
	eventTime, err := time.Parse(time.RFC3339, req.EventTime)
	if err != nil {
		http.Error(w, "Invalid event_time format", http.StatusBadRequest)
		return
	}
	now := time.Now()
	res, err := database.DB.Exec(
		"INSERT INTO group_events (group_id, creator_id, title, description, event_time, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		groupID, userID, req.Title, req.Description, eventTime, now,
	)
	if err != nil {
		http.Error(w, "Failed to create event", http.StatusInternalServerError)
		return
	}
	eventID, _ := res.LastInsertId()
	w.WriteHeader(http.StatusCreated)
	// Fetch the full event info for broadcast (simplified)
	var event struct {
		ID          int64     `json:"id"`
		GroupID     int64     `json:"group_id"`
		CreatorID   int64     `json:"creator_id"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		EventTime   time.Time `json:"event_time"`
		CreatedAt   time.Time `json:"created_at"`
	}
	dbErr := database.DB.QueryRow("SELECT id, group_id, creator_id, title, description, event_time, created_at FROM group_events WHERE id = ?", eventID).Scan(&event.ID, &event.GroupID, &event.CreatorID, &event.Title, &event.Description, &event.EventTime, &event.CreatedAt)
	if dbErr == nil {
		go BroadcastToGroup(groupID, "group_event_created", event, nil)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"event_id": eventID})
}

// GET /groups/{groupID}/events - list events (group members only)
func ListGroupEventsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	rows, err := database.DB.Query("SELECT id, group_id, creator_id, title, description, event_time, created_at FROM group_events WHERE group_id = ? ORDER BY event_time ASC", groupID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type EventWithRSVP struct {
		ID            int64   `json:"id"`
		GroupID       int64   `json:"group_id"`
		CreatorID     int64   `json:"creator_id"`
		Title         string  `json:"title"`
		Description   string  `json:"description"`
		EventTime     string  `json:"event_time"`
		CreatedAt     string  `json:"created_at"`
		GoingCount    int     `json:"going_count"`
		NotGoingCount int     `json:"not_going_count"`
		UserResponse  *string `json:"user_response"`
	}

	var events []EventWithRSVP
	for rows.Next() {
		var e EventWithRSVP
		var eventTime time.Time
		var createdAt time.Time
		if err := rows.Scan(&e.ID, &e.GroupID, &e.CreatorID, &e.Title, &e.Description, &eventTime, &createdAt); err != nil {
			continue
		}
		e.EventTime = eventTime.Format(time.RFC3339)
		e.CreatedAt = createdAt.Format(time.RFC3339)

		// Count "going"
		database.DB.QueryRow("SELECT COUNT(*) FROM group_event_rsvps WHERE event_id = ? AND response = 'going'", e.ID).Scan(&e.GoingCount)
		// Count "not going"
		database.DB.QueryRow("SELECT COUNT(*) FROM group_event_rsvps WHERE event_id = ? AND response = 'not going'", e.ID).Scan(&e.NotGoingCount)
		// Get current user's response
		var resp sql.NullString
		database.DB.QueryRow("SELECT response FROM group_event_rsvps WHERE event_id = ? AND user_id = ?", e.ID, userID).Scan(&resp)
		if resp.Valid {
			val := resp.String
			if val == "not going" {
				val = "not_going"
			}
			e.UserResponse = &val
		} else {
			e.UserResponse = nil
		}

		events = append(events, e)
	}
	if events == nil {
		events = []EventWithRSVP{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// POST /groups/{groupID}/events/{eventID}/rsvp - RSVP to event (group members only)
func RSVPGroupEventHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	eventID, _ := strconv.ParseInt(r.PathValue("eventID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}
	var req struct {
		Response string `json:"response"` // "going" or "not going"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Response != "going" && req.Response != "not going") {
		http.Error(w, "Invalid RSVP", http.StatusBadRequest)
		return
	}
	now := time.Now()
	_, err = database.DB.Exec(
		"INSERT INTO group_event_rsvps (event_id, user_id, response, responded_at) VALUES (?, ?, ?, ?) ON CONFLICT(event_id, user_id) DO UPDATE SET response = excluded.response, responded_at = excluded.responded_at",
		eventID, userID, req.Response, now,
	)
	if err != nil {
		http.Error(w, "Failed to RSVP", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	// Broadcast RSVP update (send eventID, userID, response)
	go BroadcastToGroup(groupID, "group_event_rsvp_updated", map[string]interface{}{
		"event_id": eventID,
		"user_id":  userID,
		"response": req.Response,
	}, nil)
}

// GET /groups/{groupID}/online-members - get online user IDs for a group
func GetOnlineGroupMembersHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)

	// Check if user is a member
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Use your existing utility
	onlineIDs := GetOnlineGroupMembers(groupID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"online_user_ids": onlineIDs})
}

func ListGroupMessagesHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}

	type GroupMessage struct {
		ID        int64  `json:"id"`
		GroupID   int64  `json:"group_id"`
		SenderID  int64  `json:"sender_id"`
		Username  string `json:"username"`
		Content   string `json:"content"`
		CreatedAt string `json:"created_at"`
	}

	rows, err := database.DB.Query(`
		SELECT m.id, m.group_id, m.sender_id, u.username, m.content, m.created_at
		FROM group_chat_messages m
		JOIN users u ON m.sender_id = u.id
		WHERE m.group_id = ?
		ORDER BY m.created_at ASC
	`, groupID)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []GroupMessage
	for rows.Next() {
		var m GroupMessage
		if err := rows.Scan(&m.ID, &m.GroupID, &m.SenderID, &m.Username, &m.Content, &m.CreatedAt); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []GroupMessage{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// DELETE /groups/{groupID}/posts/{postID} - delete a group post (owner or group creator only)
func DeleteGroupPostHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	groupID, _ := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	postID, _ := strconv.ParseInt(r.PathValue("postID"), 10, 64)

	// Check membership
	var status string
	err := database.DB.QueryRow("SELECT status FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'accepted'", groupID, userID).Scan(&status)
	if err != nil {
		http.Error(w, "Not a group member", http.StatusForbidden)
		return
	}

	// Check if user is post owner or group creator
	var postOwnerID, groupCreatorID int64
	err = database.DB.QueryRow("SELECT p.user_id, g.creator_id FROM group_posts p JOIN groups g ON p.group_id = g.id WHERE p.id = ? AND p.group_id = ?", postID, groupID).Scan(&postOwnerID, &groupCreatorID)
	if err != nil {
		http.Error(w, "Post not found", http.StatusNotFound)
		return
	}
	if userID != postOwnerID && userID != groupCreatorID {
		http.Error(w, "Forbidden: only post owner or group creator can delete", http.StatusForbidden)
		return
	}

	// Delete post (and optionally its comments, likes, etc.)
	_, err = database.DB.Exec("DELETE FROM group_posts WHERE id = ? AND group_id = ?", postID, groupID)
	if err != nil {
		http.Error(w, "Failed to delete post", http.StatusInternalServerError)
		return
	}
	// Optionally, delete related comments
	_, _ = database.DB.Exec("DELETE FROM group_post_comments WHERE post_id = ?", postID)
	w.WriteHeader(http.StatusNoContent)
}
