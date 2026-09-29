#!/bin/sh
set -eu

tag="${1:-}"
case "$tag" in
  *[!0-9a-f]*|"") echo "Invalid image tag" >&2; exit 2 ;;
esac

: "${APP_IMAGE:?APP_IMAGE is required}"
: "${GITHUB_ACTOR:?GITHUB_ACTOR is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

deploy_root="${DEPLOY_ROOT:-/opt/douyin-script}"
deploy_mode="${DEPLOY_MODE:-standard}"
registry="${GHCR_REGISTRY:-ghcr.io}"
case "$deploy_root" in
  /*) ;;
  *) echo "DEPLOY_ROOT must be absolute" >&2; exit 2 ;;
esac
case "$deploy_mode" in
  standard) compose_files="$deploy_root/compose.yml" ;;
  ip-http) compose_files="$deploy_root/compose.ip-http.yml" ;;
  *) echo "Invalid deploy mode" >&2; exit 2 ;;
esac

umask 077
docker_config="$(mktemp -d)"
cleanup() {
  DOCKER_CONFIG="$docker_config" docker logout "$registry" >/dev/null 2>&1 || true
  rm -rf "$docker_config"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
export DOCKER_CONFIG="$docker_config"

# Only release configuration is updated. Runtime environment and state files stay in place.
install -d "$deploy_root/deploy/backup"
install -m 0644 compose.yml "$deploy_root/compose.yml"
install -m 0644 compose.ip-http.yml "$deploy_root/compose.ip-http.yml"
install -m 0644 deploy/Caddyfile "$deploy_root/deploy/Caddyfile"
install -m 0644 deploy/Caddyfile.local "$deploy_root/deploy/Caddyfile.local"
install -m 0644 deploy/Caddyfile.ip-http "$deploy_root/deploy/Caddyfile.ip-http"
install -m 0644 deploy/backup/Dockerfile "$deploy_root/deploy/backup/Dockerfile"
install -m 0755 deploy/backup/backup.sh "$deploy_root/deploy/backup/backup.sh"
install -m 0755 deploy/deploy.sh "$deploy_root/deploy/deploy.sh"
install -m 0755 deploy/server-hardening.sh "$deploy_root/deploy/server-hardening.sh"
install -m 0755 deploy/self-hosted-deploy.sh "$deploy_root/deploy/self-hosted-deploy.sh"
install -m 0755 deploy/validate-env.sh "$deploy_root/deploy/validate-env.sh"

sh "$deploy_root/deploy/validate-env.sh" "$deploy_root" "$deploy_mode"

printf '%s' "$GITHUB_TOKEN" | docker login "$registry" \
  --username "$GITHUB_ACTOR" --password-stdin >/dev/null
unset GITHUB_TOKEN

cd "$deploy_root"
APP_IMAGE="$APP_IMAGE" DEPLOY_COMPOSE_FILE="$compose_files" sh ./deploy/deploy.sh "$tag"
