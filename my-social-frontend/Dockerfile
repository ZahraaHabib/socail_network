
# Dockerfile for Next.js frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
WORKDIR /app/my-social-frontend
RUN npm install
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/my-social-frontend .
EXPOSE 3000
CMD ["npm", "start"]
