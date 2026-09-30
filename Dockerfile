FROM node:22-alpine AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://app:build-only@127.0.0.1:5432/douyin_scripts?schema=public \
    SESSION_SECRET=build-only-session-secret-at-least-32-characters \
    ADMIN_MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    NEXT_PUBLIC_APP_URL=http://localhost:3000 \
    DOUYIN_PROVIDER=blocked
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache curl bash postgresql-client ffmpeg
RUN addgroup -S app && adduser -S app -G app
# Copy standalone output (includes .next, node_modules, package.json, server.js)
COPY --from=build --chown=app:app /app/.next/standalone ./.next/standalone
# The standalone server resolves assets relative to its own runtime root.
COPY --from=build --chown=app:app /app/.next/static ./.next/standalone/.next/static
# Copy the entire node_modules from build (reproducible via package-lock.json)
# Do NOT re-run npm install to avoid implicit upgrades
COPY --from=build --chown=app:app /app/node_modules ./node_modules
# Copy Prisma schema and config for migrate command
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts ./
# Copy worker and lib files for Worker service
COPY --from=build --chown=app:app /app/worker ./worker
COPY --from=build --chown=app:app /app/lib ./lib
# The staging-only sentence probe stays inert unless both staging gates are explicitly supplied.
COPY --from=build --chown=app:app /app/scripts/staging-custom-script-sentence-probe.ts ./scripts/staging-custom-script-sentence-probe.ts
COPY --from=build --chown=app:app /app/scripts/staging-custom-script-replacement-probe.ts ./scripts/staging-custom-script-replacement-probe.ts
COPY --from=build --chown=app:app /app/tsconfig.json ./
COPY --from=build --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
ENV PATH="/app/node_modules/.bin:${PATH}"
# Use prisma CLI from node_modules
CMD ["sh", "-c", "prisma migrate deploy && node .next/standalone/server.js"]
