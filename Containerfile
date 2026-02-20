# Base image for both services
FROM docker.io/node:20.11-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ 

# --------------------------
# Dependencies Stage
# --------------------------
FROM base AS dependencies
COPY package.json ./
# Install root dependencies
RUN npm install
# Install sub-project dependencies
COPY admin/package.json ./admin/
COPY src/collector/package.json ./src/collector/
COPY src/analyzer/package.json ./src/analyzer/
COPY web/package.json ./web/
RUN npm install --prefix admin && \
    npm install --prefix src/collector && \
    npm install --prefix src/analyzer && \
    npm install --prefix web

# --------------------------
# Admin Stage
# --------------------------
FROM dependencies AS admin-prod
COPY . .
EXPOSE 3000
CMD ["node", "admin/server.js"]

FROM dependencies AS admin-dev
COPY . .
CMD ["npm", "run", "dev:admin"]

# --------------------------
# Collector Stage
# --------------------------
FROM dependencies AS collector-prod
COPY . .
CMD ["npm", "run", "collect"]

FROM dependencies AS collector-dev
COPY . .
CMD ["npm", "run", "collect"]

# --------------------------
# Analyzer Stage
# --------------------------
FROM dependencies AS analyzer-prod
ARG GEMINI_API_KEY
ARG GH_TOKEN
ENV GEMINI_API_KEY=${GEMINI_API_KEY}
ENV GH_TOKEN=${GH_TOKEN}
COPY . .
CMD ["npm", "run", "analyze"]

FROM analyzer-prod AS analyzer-dev
# analyzer-dev is same as prod for verification purposes
CMD ["npm", "run", "analyze"]

# --------------------------
# Web Stage (Astro Frontend)
# --------------------------
FROM dependencies AS web-dev
WORKDIR /app/web
CMD ["npm", "run", "dev", "--host"]

FROM dependencies AS web-prod
COPY . .
RUN npm run build --prefix web
# For web-prod, we just need to build, but typically it is served via static hosting.
# This stage is for verifying the build in CI.
CMD ["npm", "run", "preview", "--prefix", "web", "--", "--host"]
