# Social Network

A full-stack Facebook-style social network with real-time features, built using Go, SQLite, WebSockets, Docker, and a modern JavaScript frontend framework.

---

## 🚀 Features

- 🔐 Authentication with sessions and cookies
- 👤 Public and Private User Profiles
- 👥 Follow/Unfollow with request/approval logic
- 📝 Posts with media and privacy settings
- 💬 Real-time private and group chat using WebSockets
- 📢 Notifications for requests, invites, and events
- 🧑‍🤝‍🧑 Group creation, invitations, events, and chat
- 🐳 Containerized with Docker

---

## 🧱 Tech Stack

- **Frontend:** Next.js 15 with React 19, TypeScript, and Tailwind CSS
- **Backend:** Golang with Gorilla Mux router
- **Database:** SQLite with migrations
- **WebSockets:** Gorilla WebSocket for real-time communication
- **Authentication:** Cookies and sessions (not JWT)
- **Security:** CORS handling with rs/cors
- **Styling:** Tailwind CSS v4
- **Containerization:** Docker (Backend and Frontend images)

---

## 📂 Project Structure

```
social-network/
├── README.md
├── my-social-backend/           # Go backend server
│   ├── go.mod                   # Go module dependencies
│   ├── go.sum                   # Go module checksums
│   ├── main.go                  # Main server entry point
│   ├── social_network.db        # SQLite database
│   ├── database/                # Database connection and queries
│   │   └── database.go
│   ├── middleware/              # HTTP middleware
│   │   └── auth_middleware.go
│   ├── models/                  # Data models and structures
│   │   ├── auth_models.go
│   │   ├── comment_models.go
│   │   ├── follow_models.go
│   │   ├── group_models.go
│   │   ├── like_models.go
│   │   ├── message_models.go
│   │   └── post_models.go
│   ├── uploads/                 # User uploaded files
│   │   └── posts/
│   └── util/                    # Utilities and API handlers
│       ├── session.go
│       └── api/
│           ├── auth_handlers.go
│           ├── comment_handlers.go
│           ├── follow_handler.go
│           ├── group_handlers.go
│           ├── image_handlers.go
│           ├── like_handlers.go
│           ├── message_handlers.go
│           ├── post_handlers.go
│           ├── profile_v2_handler.go
│           └── ws_handlers.go
└── my-social-frontend/          # Next.js frontend application
    ├── package.json             # Node.js dependencies
    ├── next.config.ts           # Next.js configuration
    ├── tailwind.config.js       # Tailwind CSS configuration
    ├── tsconfig.json            # TypeScript configuration
    ├── public/                  # Static assets
    └── src/
        ├── app/                 # Next.js 13+ App Router
        │   ├── layout.tsx       # Root layout
        │   ├── page.tsx         # Home page
        │   ├── feed/            # Main feed
        │   ├── login/           # Authentication pages
        │   ├── register/
        │   ├── posts/           # Post detail pages
        │   ├── profile/         # User profiles
        │   └── test-*/          # Testing pages
        ├── components/          # Reusable React components
        │   ├── GroupChat.tsx
        │   └── Header.tsx
        ├── context/             # React context providers
        │   └── AuthContext.tsx
        └── hooks/               # Custom React hooks
            └── useWebSocket.ts
```

---

## 🛠️ Installation & Setup

### Prerequisites
- Go 1.24.0 or higher
- Node.js 18+ and npm/yarn
- SQLite3
- Git

### Backend Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd social-network/my-social-backend
   ```

2. **Install Go dependencies:**
   ```bash
   go mod download
   ```

3. **Run database migrations:**
   ```bash
   # Database migrations will be handled automatically on first run
   # Or you can set up your migration scripts here
   ```

4. **Start the backend server:**
   ```bash
   go run main.go
   ```
   The backend will start on `http://localhost:8080`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd ../my-social-frontend
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```
   The frontend will start on `http://localhost:3000`

---

## 🚀 Usage

### Development Mode
1. Start the backend server: `cd my-social-backend && go run main.go`
2. Start the frontend server: `cd my-social-frontend && npm run dev`
3. Open your browser to `http://localhost:3000`

### Production Build
1. **Backend:**
   ```bash
   cd my-social-backend
   go build -o social-network-server main.go
   ./social-network-server
   ```

2. **Frontend:**
   ```bash
   cd my-social-frontend
   npm run build
   npm start
   ```

---

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Posts
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create new post
- `GET /api/posts/:id` - Get specific post
- `POST /api/posts/:id/like` - Like/unlike post
- `POST /api/posts/:id/comment` - Add comment to post

### Users & Profiles
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `POST /api/follow` - Send follow request
- `PUT /api/follow/accept` - Accept follow request

### Groups
- `GET /api/groups` - Get user groups
- `POST /api/groups` - Create new group
- `POST /api/groups/:id/invite` - Invite users to group
- `POST /api/groups/:id/join` - Join group

### Messages
- `GET /api/messages` - Get messages
- `POST /api/messages` - Send message
- `WebSocket /ws` - Real-time messaging

---

## 🔌 WebSocket Events

The application uses WebSockets for real-time features:

- **Message Events:** Real-time private and group messaging
- **Notification Events:** Follow requests, group invitations, likes, comments
- **Status Events:** User online/offline status
- **Group Events:** Group chat, member updates

---

## 🐳 Docker Deployment

*Note: Docker configuration files need to be added*

### Backend Dockerfile
```dockerfile
# Add Dockerfile for Go backend
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o social-network-server main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/social-network-server .
EXPOSE 8080
CMD ["./social-network-server"]
```

### Frontend Dockerfile
```dockerfile
# Add Dockerfile for Next.js frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## � License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Gorilla WebSocket](https://github.com/gorilla/websocket) for WebSocket implementation
- [Gorilla Mux](https://github.com/gorilla/mux) for HTTP routing
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [SQLite](https://sqlite.org/) for the database
