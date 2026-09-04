FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
# The demo adapter is never bundled into this image — `VITE_DEMO` is unset, so
# the dynamic import in src/api/transport.ts is dead code and Vite drops it.
# It is still needed here, because `tsc` type-checks that import either way.
COPY packages/demo/package.json packages/demo/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @mgms/shared --workspace @mgms/demo --workspace @mgms/web --include-workspace-root

COPY packages/shared packages/shared
COPY packages/demo packages/demo
COPY apps/web apps/web

RUN npm run build --workspace @mgms/shared && npm run build --workspace @mgms/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
