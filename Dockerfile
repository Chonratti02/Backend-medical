# =============================================================
# Stage 1: Base image
# =============================================================
FROM node:20-alpine AS base

WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# =============================================================
# Stage 2: Development (Live reload with nodemon & ts-node)
# =============================================================
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development

# Install all dependencies including devDependencies
RUN npm install

# Copy configs and initial source
COPY tsconfig.json nodemon.json* ./
COPY src/ ./src/

# Create uploads folder for file storage
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["npm", "run", "dev"]

# =============================================================
# Stage 3: Build TypeScript source code for Production
# =============================================================
FROM base AS builder

WORKDIR /app

# Install dependencies for compilation
RUN npm ci

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript in dist/
RUN npm run build

# =============================================================
# Stage 4: Production Runtime
# =============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy dependency definition files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create uploads folder for file storage and set node permissions
RUN mkdir -p /app/uploads && chown -R node:node /app

# Switch to non-root user
USER node

EXPOSE 3000

# Health check using the Express /health endpoint (supports dynamic PORT on Railway/Render)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD sh -c "wget --no-verbose --tries=1 --spider http://127.0.0.1:\${PORT:-3000}/health || exit 1"

CMD ["node", "dist/server.js"]
