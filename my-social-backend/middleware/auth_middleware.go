package middleware

import (
    "context"
    "log"
    "net/http"

    "reda-social-network/util"
)

// UserIDKey is the key used to store the UserID in the request context.
type UserIDKeyType string
const UserIDKey UserIDKeyType = "userID"

// AuthMiddleware checks for a valid session. If valid, it proceeds to the next handler.
// Otherwise, it returns an unauthorized error.
// This is similar to the authMiddleware in the workspace's server/main.go
func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userID, err := util.GetUserIDFromRequest(r)
        if err != nil {
            // This error is for issues like malformed cookies, not just "no cookie"
            log.Printf("Error getting UserID from request in middleware: %v", err)
            http.Error(w, "Server error processing authentication", http.StatusInternalServerError)
            return
        }

        if userID == 0 {
            // No valid session found (either no cookie, invalid token, or user deleted)
            log.Printf("AuthMiddleware: Unauthorized access attempt from %s to %s", r.RemoteAddr, r.URL.Path)
            http.Error(w, "Unauthorized: You must be logged in.", http.StatusUnauthorized)
            return
        }

        // If authentication is successful, add userID to the request context
        // This allows downstream handlers to access the authenticated user's ID
        ctx := context.WithValue(r.Context(), UserIDKey, userID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}