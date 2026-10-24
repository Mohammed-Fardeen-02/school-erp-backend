# Multi-stage Dockerfile for Production Node.js / TypeScript App
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies first for better layer caching
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy source code and build
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=5000

# Security: Create and run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /usr/src/app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/prisma ./prisma

USER nodejs

EXPOSE 5000

CMD ["node", "dist/server.js"]
