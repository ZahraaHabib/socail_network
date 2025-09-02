package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/pkg/db/sqlite"
	"reda-social-network/util"
	"reda-social-network/util/api"

	"github.com/rs/cors"
)

// localCheckAuth demonstrates fixing the cookie name and session check.
func localCheckAuth(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(util.SessionCookieName) // Use correct cookie name
	if err != nil {
		if err == http.ErrNoCookie {
			http.Error(w, "Unauthorized: No session cookie", http.StatusUnauthorized)
			return
		}
		http.Error(w, "Error reading session cookie", http.StatusInternalServerError)
		return
	}
	if cookie.Value == "" {
		http.Error(w, "Unauthorized: Empty session token", http.StatusUnauthorized)
		return
	}

	userID := util.GetUserIDFromSession(cookie.Value) // Use correct session check
	if userID == 0 {
		http.Error(w, "Unauthorized: Invalid session token", http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Authenticated request"))
}

func main() {
	log.Println("Initializing application...")
	dbPath := "./social_network.db"
	log.Printf("Using database at: %s", dbPath)

	flag.Parse()

	// Apply migrations before initializing the database
	migrationsPath := "pkg/db/migrations/sqlite"
	_, err := sqlite.ConnectAndMigrate(dbPath, migrationsPath)
	if err != nil {
		log.Fatalf("Failed to apply migrations: %v", err)
	}

	// Initialize Database
	if err := database.InitDB(dbPath); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	// defer database.DB.Close() // DB is a global var, typically closed on app shutdown if needed explicitly.

	mux := http.NewServeMux()
	mux.Handle("/ws", middleware.AuthMiddleware(http.HandlerFunc(api.WebSocketHandler)))
	// Auth handlers
	mux.HandleFunc("POST /register", api.RegisterHandler)
	mux.HandleFunc("POST /login", api.LoginHandler)
	mux.HandleFunc("POST /logout", api.LogoutHandler)
	mux.Handle("GET /checkAuth", middleware.AuthMiddleware(http.HandlerFunc(localCheckAuth)))

	// Message notification handler (NEW)
	mux.Handle("GET /messages/unread", middleware.AuthMiddleware(http.HandlerFunc(api.GetUnreadMessagesHandler)))

	// Post handlers
	mux.Handle("POST /posts", middleware.AuthMiddleware(http.HandlerFunc(api.CreatePostHandler)))
	mux.Handle("GET /posts", middleware.AuthMiddleware(http.HandlerFunc(api.GetPostsHandler)))
	mux.Handle("DELETE /posts/{postID}", middleware.AuthMiddleware(http.HandlerFunc(api.DeletePostHandler)))

	// Image upload handler
	mux.Handle("POST /upload-image", middleware.AuthMiddleware(http.HandlerFunc(api.ImageUploadHandler)))

	// Avatar upload handler
	mux.Handle("POST /upload/avatar", middleware.AuthMiddleware(http.HandlerFunc(api.AvatarUploadHandler)))

	// Comment handlers
	mux.Handle("POST /posts/{postID}/comments", middleware.AuthMiddleware(http.HandlerFunc(api.CreateCommentHandler)))
	mux.Handle("GET /posts/{postID}/comments", middleware.AuthMiddleware(http.HandlerFunc(api.GetCommentsForPostHandler)))

	// Like handlers
	mux.Handle("POST /posts/{postID}/like", middleware.AuthMiddleware(http.HandlerFunc(api.ToggleLikePostHandler)))
	mux.Handle("POST /posts/{postID}/dislike", middleware.AuthMiddleware(http.HandlerFunc(api.ToggleLikePostHandler)))

	// Follow handlers
	// To request to follow a user:
	mux.Handle("POST /users/{targetUserID}/follow", middleware.AuthMiddleware(http.HandlerFunc(api.RequestFollowUserHandler)))
	// To unfollow a user:
	mux.Handle("DELETE /users/{targetUserID}/follow", middleware.AuthMiddleware(http.HandlerFunc(api.UnfollowUserHandler)))
	// To get a user's followers list:
	mux.Handle("GET /users/{userID}/followers", middleware.AuthMiddleware(http.HandlerFunc(api.GetFollowersHandler))) // Or public if profiles are public
	// To get a user's following list:
	mux.Handle("GET /users/{userID}/following", middleware.AuthMiddleware(http.HandlerFunc(api.GetFollowingHandler))) // Or public
	// To get pending follow requests for the authenticated user:
	mux.Handle("GET /follow-requests", middleware.AuthMiddleware(http.HandlerFunc(api.GetPendingFollowRequestsHandler)))
	// To accept/reject a follow request made by {followerID} to the authenticated user:
	mux.Handle("PATCH /follow-requests/{followerID}", middleware.AuthMiddleware(http.HandlerFunc(api.HandleFollowRequestHandler)))

	// User Profile & Settings handlers
	// New V2 User Profile Endpoint
	mux.Handle("GET /v2/users/{userID}", middleware.AuthMiddleware(http.HandlerFunc(api.GetUserProfileV2Handler)))
	mux.Handle("GET /v2/users/me", middleware.AuthMiddleware(http.HandlerFunc(api.GetUserProfileV2Handler)))
	mux.Handle("PUT /v2/users/me", middleware.AuthMiddleware(http.HandlerFunc(api.UpdateUserProfileV2Handler)))
	mux.Handle("GET /users/available-for-invite", middleware.AuthMiddleware(http.HandlerFunc(api.GetAvailableUsersHandler)))
	mux.Handle("GET /whoami", middleware.AuthMiddleware(http.HandlerFunc(api.WhoAmIHandler)))

	// Close Friends handlers
	mux.Handle("POST /close-friends", middleware.AuthMiddleware(http.HandlerFunc(api.AddCloseFriendHandler)))
	mux.Handle("DELETE /close-friends/{targetUserID}", middleware.AuthMiddleware(http.HandlerFunc(api.RemoveCloseFriendHandler)))
	mux.Handle("GET /close-friends", middleware.AuthMiddleware(http.HandlerFunc(api.GetCloseFriendsHandler)))
	mux.Handle("GET /close-friends/check/{targetUserID}", middleware.AuthMiddleware(http.HandlerFunc(api.CheckCloseFriendHandler)))

	// ... other handlers for groups, events, notifications, etc. would go here ...
	// ...existing code...

	// Private messaging routes
	mux.Handle("POST /messages/{receiverID}", middleware.AuthMiddleware(http.HandlerFunc(api.SendMessageHandler)))
	mux.Handle("GET /conversations", middleware.AuthMiddleware(http.HandlerFunc(api.GetConversationsHandler)))
	mux.Handle("GET /messages/unread-count", middleware.AuthMiddleware(http.HandlerFunc(api.GetUnreadMessagesCountHandler)))
	mux.Handle("GET /chat/users", middleware.AuthMiddleware(http.HandlerFunc(api.GetChattableUsersHandler)))
	mux.Handle("GET /messages/{otherUserID}", middleware.AuthMiddleware(http.HandlerFunc(api.GetMessagesHandler)))
	mux.Handle("PATCH /messages/{messageID}/read", middleware.AuthMiddleware(http.HandlerFunc(api.MarkMessageAsReadHandler)))
	// Group management routes
	mux.Handle("POST /groups", middleware.AuthMiddleware(http.HandlerFunc(api.CreateGroupHandler)))
	mux.Handle("GET /groups", middleware.AuthMiddleware(http.HandlerFunc(api.ListGroupsHandler)))
	mux.Handle("GET /groups/my", middleware.AuthMiddleware(http.HandlerFunc(api.GetMyGroupsHandler)))
	mux.Handle("GET /groups/invitations", middleware.AuthMiddleware(http.HandlerFunc(api.GetPendingInvitationsHandler)))
	mux.Handle("GET /groups/{groupID}/members", middleware.AuthMiddleware(http.HandlerFunc(api.GetGroupMembersHandler)))
	mux.Handle("POST /groups/{groupID}/invite", middleware.AuthMiddleware(http.HandlerFunc(api.InviteToGroupHandler)))
	mux.Handle("POST /groups/{groupID}/accept-invite", middleware.AuthMiddleware(http.HandlerFunc(api.AcceptGroupInviteHandler)))
	mux.Handle("POST /groups/{groupID}/reject-invite", middleware.AuthMiddleware(http.HandlerFunc(api.RejectGroupInviteHandler)))
	mux.Handle("POST /groups/{groupID}/request", middleware.AuthMiddleware(http.HandlerFunc(api.RequestToJoinGroupHandler)))
	mux.Handle("POST /groups/{groupID}/handle-request", middleware.AuthMiddleware(http.HandlerFunc(api.HandleJoinRequestHandler)))
	mux.Handle("GET /groups/{groupID}/online-members", middleware.AuthMiddleware(http.HandlerFunc(api.GetOnlineGroupMembersHandler)))

	// Group posts routes
	mux.Handle("GET /groups/{groupID}/posts", middleware.AuthMiddleware(http.HandlerFunc(api.ListGroupPostsHandler)))
	mux.Handle("POST /groups/{groupID}/posts", middleware.AuthMiddleware(http.HandlerFunc(api.CreateGroupPostHandler)))
	mux.Handle("DELETE /groups/{groupID}/posts/{postID}", middleware.AuthMiddleware(http.HandlerFunc(api.DeleteGroupPostHandler)))

	// Group post comments routes
	mux.Handle("GET /groups/{groupID}/posts/{postID}/comments", middleware.AuthMiddleware(http.HandlerFunc(api.ListGroupPostCommentsHandler)))
	mux.Handle("POST /groups/{groupID}/posts/{postID}/comments", middleware.AuthMiddleware(http.HandlerFunc(api.CreateGroupPostCommentHandler)))

	// Typing indicators
	mux.Handle("POST /messages/typing", middleware.AuthMiddleware(http.HandlerFunc(api.SendTypingIndicatorHandler)))

	// Online status
	mux.Handle("GET /users/online-status", middleware.AuthMiddleware(http.HandlerFunc(api.GetUsersOnlineStatusHandler)))
	mux.Handle("GET /users/{userID}/online-status", middleware.AuthMiddleware(http.HandlerFunc(api.GetUserOnlineStatusHandler)))
	// Group events routes
	mux.Handle("POST /groups/{groupID}/events", middleware.AuthMiddleware(http.HandlerFunc(api.CreateGroupEventHandler)))
	mux.Handle("GET /groups/{groupID}/events", middleware.AuthMiddleware(http.HandlerFunc(api.ListGroupEventsHandler)))
	mux.Handle("POST /groups/{groupID}/events/{eventID}/rsvp", middleware.AuthMiddleware(http.HandlerFunc(api.RSVPGroupEventHandler)))

	// Group chat messages route
	mux.Handle("GET /groups/{groupID}/messages", middleware.AuthMiddleware(http.HandlerFunc(api.ListGroupMessagesHandler)))

	// Notification routes
	mux.Handle("GET /notifications", middleware.AuthMiddleware(http.HandlerFunc(api.GetNotificationsHandler)))
	mux.Handle("GET /notifications/unread-count", middleware.AuthMiddleware(http.HandlerFunc(api.GetUnreadCountHandler)))
	mux.Handle("PATCH /notifications/{notificationID}/read", middleware.AuthMiddleware(http.HandlerFunc(api.MarkNotificationAsReadHandler)))
	mux.Handle("POST /notifications/mark-all-read", middleware.AuthMiddleware(http.HandlerFunc(api.MarkAllNotificationsAsReadHandler)))

	// Static file server for uploaded images
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./uploads/"))))

	// --- CORS Middleware ---
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true, // Required for cookies!
	})

	handler := c.Handler(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port if not specified
	}

	fmt.Printf("Server running on localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
