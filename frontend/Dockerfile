FROM node:24.11-alpine AS build
WORKDIR /app
# Manifests first, so the npm ci layer is cached until the dependencies change
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Unprivileged variant: runs as non-root, so it listens on 8080 instead of 80
FROM nginxinc/nginx-unprivileged:1.29.3-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
