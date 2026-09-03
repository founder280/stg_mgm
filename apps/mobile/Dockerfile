FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace @mgms/shared --workspace @mgms/mobile --include-workspace-root

COPY packages/shared packages/shared
COPY apps/mobile apps/mobile

RUN npm run build --workspace @mgms/shared && npm run build --workspace @mgms/mobile

FROM nginx:1.27-alpine AS runtime
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html
EXPOSE 80
