FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Build Next.js (required for app.prepare())
RUN npm run build

# Expose port
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production

# Run our custom proxy server (NOT next start!)
CMD ["node", "server.mjs"]
