
# Dockerfile for Go backend
FROM golang:1.22-alpine3.20 AS builder
WORKDIR /app
COPY . .
WORKDIR /app/my-social-backend
RUN apk add --no-cache git && go mod download
RUN go build -o server main.go

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/my-social-backend/server ./server
COPY --from=builder /app/my-social-backend/social_network.db ./social_network.db
COPY --from=builder /app/my-social-backend/pkg ./pkg
COPY --from=builder /app/my-social-backend/database ./database
COPY --from=builder /app/my-social-backend/middleware ./middleware
COPY --from=builder /app/my-social-backend/models ./models
COPY --from=builder /app/my-social-backend/util ./util
COPY --from=builder /app/my-social-backend/uploads ./uploads
EXPOSE 8080
CMD ["./server"]
