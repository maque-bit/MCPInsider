# Base image for both services
FROM docker.io/node:20.11-alpine AS base
WORKDIR /app

# Install native dependencies which might be needed for certain npm packages
RUN apk add --no-cache python3 make g++ 

# --------------------------
# Admin Stage (Collector, Analyzer, Admin API)
# --------------------------
FROM base AS admin-dev
# Copy root package files
COPY package.json ./
# We will mount volumes for development, but we need global dependencies if any.
CMD ["npm", "run", "dev:admin"]

# --------------------------
# Web Stage (Astro Frontend)
# --------------------------
FROM base AS web-dev
WORKDIR /app/web
# For development, we mount the volume and run astro dev
CMD ["npm", "run", "dev", "--host"]
