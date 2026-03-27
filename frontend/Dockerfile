FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root manifest + workspace packages
COPY package.json ./
COPY shared/ ./shared/
COPY frontend/ ./frontend/

# Install all deps
RUN npm install --workspaces

# Compile shared TypeScript → dist/, then build frontend
RUN npm run build --workspace=shared
RUN npm run build --workspace=frontend

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
