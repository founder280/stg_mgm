# Build stage — the workspace root is the build context so the shared package
# is available to compile against.
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
RUN npm ci --workspace @mgms/shared --workspace @mgms/api --include-workspace-root

COPY packages/shared packages/shared
COPY services/api services/api

RUN npm run build --workspace @mgms/shared \
 && npx prisma generate --schema services/api/prisma/schema.prisma \
 && npm run build --workspace @mgms/api

# Runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache tini \
 && addgroup -S mgms && adduser -S mgms -G mgms

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/prisma ./services/api/prisma

USER mgms
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards signals, so the graceful shutdown handler
# in server.ts actually receives SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/api/dist/server.js"]
