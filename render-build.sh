#!/usr/bin/env bash
# exit on error
set -o errexit

# Install pnpm (Render provides npm by default)
npm install -g pnpm@9.1.1

# We must install devDependencies so tsc is available for building.
# Render sets NODE_ENV=production by default, which makes pnpm skip devDependencies.
export NODE_ENV=development

# Install dependencies
pnpm install

# Generate Prisma Client
pnpm exec prisma generate

# Build all workspace packages
pnpm build

# Apply database migrations
pnpm exec prisma migrate deploy
