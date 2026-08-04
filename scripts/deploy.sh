#!/usr/bin/env bash
# Deploy the dashboard on the server. Run as nextjs-user from anywhere:
#   /home/nextjs-user/code/dashboard/scripts/deploy.sh
#
# Requires a sudoers rule allowing nextjs-user to restart exactly this unit:
#   nextjs-user ALL=(root) NOPASSWD: /usr/bin/systemctl restart outlayer-dashboard.service
set -euo pipefail
cd "$(dirname "$0")/.."

# build-llms rewrites these TRACKED files on every build (when LLMS_SOURCES_ROOT
# is set) — reset them first or git pull refuses the dirty tree.
git checkout -- public/llms.txt public/llms-full.txt 2>/dev/null || true

git pull --ff-only
npm ci --no-audit --no-fund
npm run build
sudo systemctl restart outlayer-dashboard.service
sleep 3
systemctl is-active outlayer-dashboard.service
