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

// ImageUploadHandler handles image uploads for posts
func ImageUploadHandler(w http.ResponseWriter, r *http.Request) {
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

	// Parse multipart form (32MB max memory)
	err := r.ParseMultipartForm(32 << 20) // 32 MB
	if err != nil {
		http.Error(w, "Error parsing multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Get the file from form data
	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Error retrieving file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate file type
	allowedTypes := map[string]bool{
		"image/jpeg": true,
		"image/jpg":  true,
		"image/png":  true,
		"image/gif":  true,
	}

	contentType := header.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		http.Error(w, "Invalid file type. Only JPEG, PNG, and GIF are allowed.", http.StatusBadRequest)
		return
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{
		".jpg":  true,
		".jpeg": true,
		".png":  true,
		".gif":  true,
	}

	if !allowedExts[ext] {
		http.Error(w, "Invalid file extension. Only .jpg, .jpeg, .png, and .gif are allowed.", http.StatusBadRequest)
		return
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := "./uploads/posts"
	err = os.MkdirAll(uploadsDir, os.ModePerm)
	if err != nil {
		http.Error(w, "Error creating uploads directory: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error creating uploads directory: %v", err)
		return
	}

	// Generate unique filename
	timestamp := time.Now().Unix()
	filename := fmt.Sprintf("%d_%d%s", userID, timestamp, ext)
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

	// Return the file path (relative to server root)
	relativePath := fmt.Sprintf("/uploads/posts/%s", filename)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"image_path": "%s"}`, relativePath)
}
