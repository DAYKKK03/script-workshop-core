#!/bin/sh
set -eu

tag="${1:-}"
case "$tag" in
  *[!0-9a-f]*|"") echo "Invalid image tag" >&2; exit 2 ;;
esac
: "${APP_IMAGE:?APP_IMAGE is required}"

state_file=.deployed-image-tag
previous=""
if [ -f "$state_file" ]; then previous="$(cat "$state_file")"; fi

export IMAGE_TAG="$tag"
export APP_IMAGE
release_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

compose() {
  if [ -n "${DEPLOY_COMPOSE_BIN:-}" ]; then
    if [ -n "${DEPLOY_COMPOSE_FILE:-}" ]; then
      "$DEPLOY_COMPOSE_BIN" -f "$DEPLOY_COMPOSE_FILE" "$@"
    else
      "$DEPLOY_COMPOSE_BIN" "$@"
    fi
  elif [ -n "${DEPLOY_COMPOSE_FILE:-}" ]; then
    docker compose -f "$DEPLOY_COMPOSE_FILE" "$@"
  else
    docker compose "$@"
  fi
}

if [ "${DEPLOY_SKIP_REMOTE_PREPARE:-0}" != "1" ]; then
  compose pull web worker topic-worker custom-script-worker
  compose build backup
fi

wait_for_web() {
  attempt=0
  until compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 20 ]; then return 1; fi
    sleep 5
  done
}

has_single_worker() {
  worker_replicas="$(compose ps --status running -q worker | wc -l | tr -d ' ')"
  [ "$worker_replicas" -eq 1 ]
}

has_single_topic_worker() {
  topic_worker_replicas="$(compose ps --status running -q topic-worker | wc -l | tr -d ' ')"
  [ "$topic_worker_replicas" -eq 1 ]
}

has_single_custom_script_worker() {
  custom_script_worker_replicas="$(compose ps --status running -q custom-script-worker | wc -l | tr -d ' ')"
  [ "$custom_script_worker_replicas" -eq 1 ]
}

has_single_caddy() {
  caddy_replicas="$(compose ps --status running -q caddy | wc -l | tr -d ' ')"
  [ "$caddy_replicas" -eq 1 ]
}

worker_has_fresh_tick() {
  worker_container_id="$(compose ps --status running -q worker)"
  if [ "$(printf '%s\n' "$worker_container_id" | wc -l | tr -d ' ')" -ne 1 ] || [ -z "$worker_container_id" ]; then
    echo "extraction_worker_functional_failed:probe_setup_failed" >&2
    return 1
  fi

  worker_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$worker_container_id" 2>/dev/null)" || {
    echo "extraction_worker_functional_failed:probe_setup_failed" >&2
    return 1
  }
  if [ -z "$worker_started_at" ] || [ "$worker_started_at" \< "$release_started_at" ]; then
    echo "extraction_worker_functional_failed:probe_setup_failed" >&2
    return 1
  fi

  tick_attempt=0
  while [ "$tick_attempt" -lt 15 ]; do
    if docker logs --since "$worker_started_at" "$worker_container_id" 2>/dev/null | grep -F '"event":"douyin_extraction_worker_tick"' >/dev/null; then
      worker_started_at_after="$(docker inspect --format '{{.State.StartedAt}}' "$worker_container_id" 2>/dev/null)" || {
        echo "extraction_worker_functional_failed:probe_setup_failed" >&2
        return 1
      }
      if [ "$worker_started_at_after" = "$worker_started_at" ]; then
        return 0
      fi
      echo "extraction_worker_functional_failed:probe_setup_failed" >&2
      return 1
    fi
    tick_attempt=$((tick_attempt + 1))
    sleep 1
  done

  echo "extraction_worker_functional_failed:probe_timed_out" >&2
  return 1
}

topic_worker_is_functional() {
  compose exec -T topic-worker npm run worker:topics:check || { echo "topic_worker_runtime_failed" >&2; return 1; }
}

custom_script_worker_is_functional() {
  compose exec -T custom-script-worker npm run worker:custom-scripts:check || { echo "custom_script_worker_runtime_failed" >&2; return 1; }
}

verify_release() {
  wait_for_web && has_single_worker && has_single_topic_worker && has_single_custom_script_worker && has_single_caddy && worker_has_fresh_tick && topic_worker_is_functional && custom_script_worker_is_functional
}

verify_topic_release() {
  wait_for_web && has_single_worker && has_single_topic_worker && has_single_caddy && worker_has_fresh_tick && topic_worker_is_functional
}

verify_legacy_release() {
  wait_for_web && has_single_worker && has_single_caddy && worker_has_fresh_tick
}

recover_failed_release() {
  if [ -z "$previous" ]; then
    if compose stop web worker topic-worker custom-script-worker >/dev/null 2>&1; then
      echo "Deployment failed; no previous release available" >&2
    else
      echo "Deployment failed; unverified release stop failed" >&2
    fi
    return
  fi

  export IMAGE_TAG="$previous"
  if compose up -d --scale worker=1 web worker &&
    compose up -d --scale topic-worker=1 topic-worker &&
    compose up -d --scale custom-script-worker=1 custom-script-worker &&
    verify_release; then
    echo "Deployment failed; previous release restored" >&2
  elif compose stop custom-script-worker >/dev/null 2>&1 && verify_topic_release; then
    # The first custom-script rollout may restore an image without this Worker entrypoint.
    echo "Deployment failed; previous release restored" >&2
  elif compose stop custom-script-worker topic-worker >/dev/null 2>&1 && verify_legacy_release; then
    # The first async-topic rollout may need to restore an older image that has no Topic Worker entrypoint.
    echo "Deployment failed; previous release restored" >&2
  else
    echo "Deployment failed; rollback verification failed" >&2
  fi
}

if ! compose up -d --remove-orphans --scale worker=1 --scale topic-worker=1 --scale custom-script-worker=1; then
  recover_failed_release
  exit 1
fi

# Caddyfile is bind-mounted; Compose does not detect its contents changing.
# Recreate Caddy on every release so the deployed proxy configuration is loaded.
if ! compose up -d --force-recreate caddy; then
  echo "Caddy container verification failed" >&2
  recover_failed_release
  exit 1
fi

if ! verify_release; then
  if ! has_single_caddy; then
    echo "Caddy container verification failed" >&2
  fi
  recover_failed_release
  exit 1
fi

printf '%s' "$tag" > "$state_file"
