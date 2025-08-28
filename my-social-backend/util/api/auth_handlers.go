package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"reda-social-network/database"
	"reda-social-network/middleware"
	"reda-social-network/models" // Import your models package
	"reda-social-network/util"

	"golang.org/x/crypto/bcrypt"
)

// RegisterHandler handles user registration.
func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	// Add CORS headers at the top
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.RegisterRequest // Use models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Error reading request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" || req.Username == "" {
		http.Error(w, "Email, password, and username are required", http.StatusBadRequest)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Error processing password", http.StatusInternalServerError)
		log.Printf("Error hashing password: %v", err)
		return
	}

	stmt, err := database.DB.Prepare(`
		INSERT INTO users (username, password, email, created_at, first_name, last_name, date_of_birth, avatar, about_me)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		http.Error(w, "Failed to prepare statement: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error preparing insert statement: %v", err)
		return
	}
	defer stmt.Close()

	result, err := stmt.Exec(
		req.Username,
		string(hashedPassword),
		req.Email,
		time.Now(),
		req.FirstName,
		req.LastName,
		req.DateOfBirth,
		req.Avatar,
		req.AboutMe,
	)
	if err != nil {
		http.Error(w, "Failed to register user: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error inserting user: %v", err)
		return
	}

	userID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, "Failed to retrieve user ID: "+err.Error(), http.StatusInternalServerError)
		log.Printf("Error getting last insert ID: %v", err)
		return
	}

	sessionToken, err := util.CreateSession(userID)
	if err != nil {
		log.Printf("Failed to create session for new user %d after registration: %v", userID, err)
	} else {
		http.SetCookie(w, &http.Cookie{
			Name:     util.SessionCookieName,
			Value:    sessionToken,
			Path:     "/",
			Expires:  time.Now().Add(24 * time.Hour),
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   false,
		})
		log.Printf("User %s (ID: %d) registered and session created.", req.Username, userID)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.UserResponse{ // Use models.UserResponse
		ID:       userID,
		Username: req.Username,
		Email:    req.Email,
	})
}

// LoginHandler handles user login.
// ...existing imports...

// LoginHandler handles user login.
func LoginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Login failed - invalid JSON: %v", err)
		http.Error(w, "Error reading request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Use whichever identifier is provided
	identifier := req.Username
	if identifier == "" {
		identifier = req.Email
	}
	log.Printf("Login attempt: username/email=%s", identifier)

	if identifier == "" || req.Password == "" {
		log.Printf("Login failed - missing username/email or password")
		http.Error(w, "Username/email and password are required", http.StatusBadRequest)
		return
	}

	var userID int64
	var storedPasswordHash string
	var username string
	var email string

	// Query to find user by either username or email
	err := database.DB.QueryRow("SELECT id, password, username, email FROM users WHERE username = ? OR email = ?", identifier, identifier).Scan(&userID, &storedPasswordHash, &username, &email)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("Login failed - user not found: %s", req.Username)
			http.Error(w, "Invalid username/email or password", http.StatusUnauthorized)
		} else {
			log.Printf("Login failed - database error: %v", err)
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		}
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(storedPasswordHash), []byte(req.Password))
	if err != nil {
		log.Printf("Login failed - invalid password for: %s", req.Username)
		http.Error(w, "Invalid username/email or password", http.StatusUnauthorized)
		return
	}

	sessionToken, err := util.CreateSession(userID)
	if err != nil {
		log.Printf("Login failed - session creation error: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     util.SessionCookieName,
		Value:    sessionToken,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	})

	log.Printf("Login successful for user: %s (ID: %d)", req.Username, userID) // Success log

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":       userID,
		"username": username,
		"email":    email,
	})
}

// LogoutHandler handles user logout.
func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get user ID from context before deleting session
	userID, ok := r.Context().Value(middleware.UserIDKey).(int64)

	cookie, err := r.Cookie(util.SessionCookieName)
	if err != nil {
		if err == http.ErrNoCookie {
			http.Error(w, "No active session", http.StatusUnauthorized)
			return
		}
		http.Error(w, "Server error reading cookie", http.StatusInternalServerError)
		log.Printf("Error reading session cookie on logout: %v", err)
		return
	}

	sessionToken := cookie.Value

	// Broadcast user offline status before deleting session (if we have user ID)
	if ok && userID != 0 {
		BroadcastUserStatusChange(userID, false)
		log.Printf("User %d logging out - broadcasting offline status", userID)
	}

	util.DeleteSession(sessionToken)

	http.SetCookie(w, &http.Cookie{
		Name:     util.SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
	log.Println("User logged out successfully.")
}
