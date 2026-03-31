FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root manifest + workspace packages
COPY package.json ./
COPY shared/ ./shared/
COPY frontend-v2/ ./frontend-v2/

# Install all deps
RUN npm install --workspaces

# Compile shared TypeScript → dist/, then build frontend-v2
RUN npm run build --workspace=shared
RUN npm run build --workspace=frontend-v2

FROM nginx:alpine
COPY --from=builder /app/frontend-v2/dist /usr/share/nginx/html
COPY frontend-v2/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
