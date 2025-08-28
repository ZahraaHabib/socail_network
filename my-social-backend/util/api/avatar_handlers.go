package api

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"reda-social-network/middleware"
)

// AvatarUploadHandler handles avatar uploads for user profiles
func AvatarUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check authentication
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)
	if !ok || userID == 0 {
		http.Error(w, "Unauthorized: User ID not found in session context.", http.StatusUnauthorized)
		return
	}

	// Parse multipart form (10MB max memory for avatars)
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		http.Error(w, "Error parsing multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Get the file from form data - using "avatar" as the field name
	file, header, err := r.FormFile("avatar")
	if err != nil {
		http.Error(w, "Error retrieving avatar file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file type
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/jpg":  true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
	}

	contentType := header.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		http.Error(w, "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed for avatars.", http.StatusBadRequest)
		return
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".jpg":  true,
		".jpeg": true,
		".png":  true,
		".gif":  true,
		".webp": true,
	}

	if !allowedExts[ext] {
		http.Error(w, "Invalid file extension. Only .jpg, .jpeg, .png, .gif, and .webp are allowed.", http.StatusBadRequest)
		return
	}

	// Create uploads directory for avatars if it doesn't exist
	uploadsDir := "./uploads/avatars"
	err = os.MkdirAll(uploadsDir, os.ModePerm)
	if err != nil {
		http.Error(w, "Error creating uploads directory: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error creating uploads directory: %v", err)
		return
	}

	// Generate unique filename for avatar
	timestamp := time.Now().Unix()
	filename := fmt.Sprintf("avatar_%d_%d%s", userID, timestamp, ext)
	filePath := filepath.Join(uploadsDir, filename)

	// Create the file on server
	dst, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Error creating file: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error creating file: %v", err)
		return
	}
	defer dst.Close()

	// Copy uploaded file to destination
	_, err = io.Copy(dst, file)
	if err != nil {
		http.Error(w, "Error saving file: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error saving file: %v", err)
		return
	}

	// Return the avatar URL (relative to server root)
	avatarURL := fmt.Sprintf("/uploads/avatars/%s", filename)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"avatar_url": "%s", "url": "%s"}`, avatarURL, avatarURL)
}
