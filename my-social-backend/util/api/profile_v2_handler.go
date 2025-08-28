package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"reda-social-network/database"
	"reda-social-network/models"
	"reda-social-network/util"
	"strconv"
	"time"
)

// GetUserProfileV2Handler handles fetching a user's profile using the V2 structure.
// Expected URL: GET /v2/users/{userID} or GET /v2/users/me
func GetUserProfileV2Handler(w http.ResponseWriter, r *http.Request) {
	targetUserIDStr := r.PathValue("userID")
	var targetUserID int64
	var err error

	// Handle case where the route is /v2/users/me (no path parameter)
	if targetUserIDStr == "" && r.URL.Path == "/v2/users/me" {
		targetUserIDStr = "me"
	}

	if targetUserIDStr == "me" {
		loggedInUserID, errAuth := util.GetUserIDFromRequest(r)
		if errAuth != nil || loggedInUserID == 0 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		targetUserID = loggedInUserID
	} else {
		targetUserID, err = strconv.ParseInt(targetUserIDStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid user ID in URL path", http.StatusBadRequest)
			return
		}
	}

	loggedInUserID, errAuth := util.GetUserIDFromRequest(r)

	// --- 1. Fetch Basic User Information ---
	var basicInfo models.UserBasicInfoV2
	var firstName, lastName, avatar, aboutMe, dobStr, email sql.NullString
	var createdAt time.Time
	var isPrivate bool

	queryUser := `SELECT id, username, email, created_at, 
                          COALESCE(first_name, '') as first_name, 
                          COALESCE(last_name, '') as last_name, 
                          COALESCE(avatar, '') as avatar, 
                          COALESCE(about_me, '') as about_me, 
                          is_private, 
                          COALESCE(date_of_birth, '') as date_of_birth
                   FROM users WHERE id = ?`
	err = database.DB.QueryRow(queryUser, targetUserID).Scan(
		&basicInfo.ID, &basicInfo.Username, &email, &createdAt,
		&firstName, &lastName, &avatar, &aboutMe, &isPrivate, &dobStr,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "User not found (V2)", http.StatusNotFound)
			return
		}
		http.Error(w, "Database error fetching user info (V2): "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error V2 profile (user info) for ID %d: %v", targetUserID, err)
		return
	}
	basicInfo.FirstName = firstName.String
	basicInfo.LastName = lastName.String
	basicInfo.Avatar = avatar.String
	basicInfo.AboutMe = aboutMe.String
	basicInfo.DateOfBirth = dobStr.String
	basicInfo.Email = email.String // Email is part of UserBasicInfoV2
	basicInfo.CreatedAt = createdAt
	basicInfo.IsPrivate = isPrivate

	// --- 2. Fetch User Stats ---
	var stats models.UserStatsV2
	// Fetch followers count
	err = database.DB.QueryRow(`SELECT COUNT(*) FROM followers WHERE followed_id = ? AND status = 'accept'`, targetUserID).Scan(&stats.FollowersCount)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error V2 profile (followers count) for ID %d: %v", targetUserID, err)
		// Potentially return error or log and continue with 0
	}
	// Fetch following count
	err = database.DB.QueryRow(`SELECT COUNT(*) FROM followers WHERE follower_id = ? AND status = 'accept'`, targetUserID).Scan(&stats.FollowingCount)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error V2 profile (following count) for ID %d: %v", targetUserID, err)
	}
	// Fetch posts count - corrected to use user_id
	err = database.DB.QueryRow(`SELECT COUNT(*) FROM posts WHERE user_id = ?`, targetUserID).Scan(&stats.PostsCount)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error V2 profile (posts count) for ID %d: %v", targetUserID, err)
	}

	// --- 3. Determine Relationship (if viewer is logged in and not viewing own profile) ---
	var relationship *models.UserRelationshipV2
	if errAuth == nil && loggedInUserID != 0 && loggedInUserID != targetUserID {
		rel := models.UserRelationshipV2{}
		var followStatus sql.NullString
		errFollow := database.DB.QueryRow(`SELECT status FROM followers WHERE follower_id = ? AND followed_id = ?`,
			loggedInUserID, targetUserID).Scan(&followStatus)

		if errFollow == nil {
			switch followStatus.String {
			case "accept":
				rel.IsFollowedByViewer = true
			case "pending":
				rel.HasPendingRequestFromViewer = true
			}
		} else if errFollow != sql.ErrNoRows {
			log.Printf("Error V2 profile (relationship) for viewer %d to target %d: %v", loggedInUserID, targetUserID, errFollow)
		}

		// Check if target user is in viewer's close friends
		var isCloseFriend bool
		errCloseFriend := database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM close_friends WHERE user_id = ? AND close_friend_id = ?)`,
			loggedInUserID, targetUserID).Scan(&isCloseFriend)
		if errCloseFriend == nil {
			rel.IsCloseFriend = isCloseFriend
		} else {
			log.Printf("Error V2 profile (close friend check) for viewer %d to target %d: %v", loggedInUserID, targetUserID, errCloseFriend)
		}

		relationship = &rel
	}

	// --- Privacy Check & Post Fetching ---
	var posts []models.PostResponse
	canViewFullContent := true

	if basicInfo.IsPrivate && loggedInUserID != targetUserID {
		if relationship == nil || !relationship.IsFollowedByViewer {
			canViewFullContent = false
		}
	}

	if canViewFullContent {
		// Corrected postsQuery to use user_id and match actual posts table schema
		// Also corrected like_count and user_liked subqueries for likes table schema
		postsQuery := `
            SELECT p.id, p.user_id, u.username, p.content, p.image_path, p.created_at, p.updated_at,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                   CASE WHEN ? != 0 THEN EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) ELSE FALSE END as user_liked
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ? 
            ORDER BY p.created_at DESC
            LIMIT 20`

		postRows, err_posts := database.DB.Query(postsQuery, loggedInUserID, loggedInUserID, targetUserID)
		if err_posts != nil {
			log.Printf("Error V2 profile (posts) for ID %d: %v", targetUserID, err_posts)
		} else {
			defer postRows.Close()
			for postRows.Next() {
				var p models.PostResponse
				// Scan for columns that exist in the posts table and are selected
				if err_scan := postRows.Scan(
					&p.ID, &p.UserID, &p.AuthorUsername, &p.Content, &p.ImagePath, &p.CreatedAt, &p.UpdatedAt,
					&p.LikeCount, &p.UserLiked,
				); err_scan != nil {
					log.Printf("Error scanning post for V2 profile (user %d): %v", targetUserID, err_scan)
					continue
				}
				// Title and Privacy are in PostResponse model but not in current posts table schema,
				// so they will remain as their zero values (empty string, 0).
				posts = append(posts, p)
			}
			if err_iter := postRows.Err(); err_iter != nil {
				log.Printf("Error V2 profile (iterating posts) for ID %d: %v", targetUserID, err_iter)
			}
		}
	}
	if posts == nil {
		posts = []models.PostResponse{}
	}

	// --- Compose Response ---
	response := models.UserProfileV2Response{
		User:         basicInfo,
		Stats:        stats,
		Relationship: relationship,
		Posts:        posts,
	}

	if !canViewFullContent {
		response.Posts = []models.PostResponse{} // Clear posts if profile is private and not followed
		// Optionally, limit other user info for private profiles not followed
		response.User = models.UserBasicInfoV2{
			ID:        basicInfo.ID,
			Username:  basicInfo.Username,
			Avatar:    basicInfo.Avatar,    // Show avatar even for private
			IsPrivate: basicInfo.IsPrivate, // Indicate it's private
			FirstName: basicInfo.FirstName, // Show names even for private
			LastName:  basicInfo.LastName,
		}
		// Stats might also be hidden or limited for private profiles
		// response.Stats = models.UserStatsV2{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateUserProfileV2Handler handles updating a user's profile
// Expected URL: PUT /v2/users/me
func UpdateUserProfileV2Handler(w http.ResponseWriter, r *http.Request) {
	loggedInUserID, errAuth := util.GetUserIDFromRequest(r)
	if errAuth != nil || loggedInUserID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse the request body
	var updateData struct {
		Username    string `json:"username"`
		FirstName   string `json:"firstName"`
		LastName    string `json:"lastName"`
		AboutMe     string `json:"aboutMe"`
		Email       string `json:"email"`
		DateOfBirth string `json:"dateOfBirth"`
		IsPrivate   bool   `json:"isPrivate"`
		Avatar      string `json:"avatar"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, "Invalid JSON data", http.StatusBadRequest)
		return
	}

	// Update user profile in database
	updateQuery := `UPDATE users SET 
		username = ?, 
		first_name = ?, 
		last_name = ?, 
		about_me = ?, 
		email = ?, 
		date_of_birth = ?, 
		is_private = ?,
		avatar = ?
		WHERE id = ?`

	_, err := database.DB.Exec(updateQuery,
		updateData.Username,
		updateData.FirstName,
		updateData.LastName,
		updateData.AboutMe,
		updateData.Email,
		updateData.DateOfBirth,
		updateData.IsPrivate,
		updateData.Avatar,
		loggedInUserID,
	)

	if err != nil {
		log.Printf("Error updating user profile for ID %d: %v", loggedInUserID, err)
		http.Error(w, "Failed to update profile: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Fetch and return the updated profile
	GetUserProfileV2Handler(w, r)
}
