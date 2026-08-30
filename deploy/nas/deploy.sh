#!/usr/bin/env bash
set -euo pipefail

app_name="${APP_NAME:-firmbooks}"
deploy_branch="${NAS_DEPLOY_BRANCH:-nas-deploy}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from inside the FirmBooks Git checkout." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [ "$current_branch" != "$deploy_branch" ]; then
  echo "Refusing deployment from '$current_branch'; expected '$deploy_branch'." >&2
  exit 1
fi

git fetch origin "$deploy_branch"
git pull --ff-only origin "$deploy_branch"
npm ci
npm run build
npm prune --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$app_name" >/dev/null 2>&1; then
    pm2 restart "$app_name" --update-env
  else
    pm2 start dist/server.cjs --name "$app_name"
  fi
  pm2 save
else
  echo "Build complete. PM2 is not installed; start the app with: NODE_ENV=production npm start"
fi
