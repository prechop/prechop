# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────
# Prechop production image.
#
# Reproducibility notes:
#   * Base image is pinned by DIGEST, not just a tag. `node:20-bookworm-slim`
#     is a moving target that silently changes under you; the digest does not.
#   * `pnpm install --frozen-lockfile` with NO fallback. If the lockfile and
#     package.json disagree the build FAILS. The previous
#     `|| pnpm install` fallback meant a broken lockfile produced a
#     *successfully built, quietly different* image — the exact class of bug
#     that makes "works on my machine" survive to production.
#   * Secrets are never baked in: no ARG/ENV secrets, and `.dockerignore`
#     keeps `.env*` out of the build context entirely. Runtime config is
#     injected as environment variables by the platform.
# ─────────────────────────────────────────────────────────────────────────

# Pinned to the `engines.node` floor (>=20.11.0) family. Bookworm (glibc), not
# Alpine (musl): `bcrypt` and `sharp` resolve prebuilt glibc binaries here, so
# no node-gyp toolchain is needed in the image.
ARG NODE_IMAGE=node:20.19.5-bookworm-slim@sha256:9e70124bd00f47dd023e349cd587132ae61892acc0e47ed641416c3e18f401c3

# ── base ────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
	PATH=/pnpm:$PATH \
	NEXT_TELEMETRY_DISABLED=1 \
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack activates the exact pnpm from package.json `packageManager`
# (pnpm@9.15.0) — the toolchain version is pinned by the repo, not the image.
RUN corepack enable
WORKDIR /app

# ── deps (full, including dev — needed to compile) ───────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm install --frozen-lockfile

# ── prod-deps (runtime only — devDependencies pruned) ───────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm install --frozen-lockfile --prod

# ── build ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_APP_URL is textually INLINED into the client bundle by `next build`
# — a runtime env cannot change it afterwards — so it must be correct at BUILD
# time. It is a PUBLIC origin (e.g. https://prechop.ng), NOT a secret, so it is
# safe to accept as a build ARG and to appear in image history. Leave it unset
# and the browser bundle falls back to http://localhost:3000, which the
# production boot guard rejects: a loud failure, not a silently-wrong callback.
#
# The SERVER-side origin is deliberately NOT taken from this build arg. It is
# sourced from the RUNTIME `APP_URL` env (see src/server/constants/
# environments.ts + bootstrap.ts) so a deployment can set its own origin without
# a rebuild; `NEXT_PUBLIC_APP_URL` is only the browser-inlined fallback. The
# runner therefore needs `APP_URL` injected at run time (compose.yaml / the
# platform secret store), not baked here.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
# `next build` sets NODE_ENV=production itself. We do NOT set it before the
# install above, or pnpm would skip the devDependencies the build needs.
RUN pnpm build

# ── runner ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0
WORKDIR /app

# Non-root. The `node` user (uid/gid 1000) ships with the base image.
# Everything is owned by root and merely READ by `node`: the app has no reason
# to write to its own code, so a container-escape needs one more step.
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/.next ./.next
COPY --from=build --chown=root:root /app/public ./public
COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --from=build --chown=root:root /app/next.config.ts ./next.config.ts
COPY --from=build --chown=root:root /app/instrumentation.ts ./instrumentation.ts
COPY --from=build --chown=root:root /app/src ./src

USER node

EXPOSE 3000

# Readiness, not just liveness: /api/health returns 200 only when BOTH Mongo and
# Redis answer, and 503 otherwise — so an orchestrator will not route traffic to
# a container whose datastores are down. `node` is used rather than curl/wget
# because neither exists in the slim base (and adding one to run a healthcheck
# would widen the attack surface for no reason).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
	CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/api/health',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Exec form + direct `node` invocation so the Next server is PID 1 and
# receives SIGTERM/SIGINT itself. Going through `pnpm start` put pnpm at PID 1,
# which does not forward signals — so `bootstrap.ts`'s SIGTERM handler (which
# closes Mongo/Redis) never ran and every deploy killed connections mid-flight.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
