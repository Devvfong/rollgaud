FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2 AS build

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/student-api/package.json apps/student-api/package.json
RUN corepack pnpm install --filter @devdeploy/student-api --frozen-lockfile

COPY apps/student-api/src apps/student-api/src
COPY apps/student-api/tsconfig.json apps/student-api/tsconfig.json
RUN corepack pnpm --filter @devdeploy/student-api build

FROM node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2

WORKDIR /app
ENV NODE_ENV=production
ARG COMMIT_SHA
ARG APP_VERSION=v1
ENV COMMIT_SHA=${COMMIT_SHA} APP_VERSION=${APP_VERSION}

COPY --from=build --chown=node:node /workspace/apps/student-api/dist/main.js ./main.js

USER node
EXPOSE 3000
CMD ["node", "main.js"]
