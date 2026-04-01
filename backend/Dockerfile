FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app

# Copy workspace root manifest + workspace packages
COPY package.json ./
COPY shared/ ./shared/
COPY backend/ ./backend/

# Install all deps (shared needs typescript to build)
RUN npm install --workspaces

# Compile shared TypeScript → dist/
RUN npm run build --workspace=shared

EXPOSE 3001
CMD ["node", "backend/src/index.js"]
