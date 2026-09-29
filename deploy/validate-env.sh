#!/bin/sh
set -eu

deploy_root="${1:?deploy root is required}"
deploy_mode="${2:?deploy mode is required}"
compose_env="$deploy_root/.env"
app_env="$deploy_root/.env.production"

if [ ! -f "$compose_env" ]; then
  echo "Missing required environment variables: POSTGRES_PASSWORD" >&2
  exit 1
fi

if [ ! -f "$app_env" ]; then
  echo "Missing required environment variables: DATABASE_URL, SESSION_SECRET, ADMIN_MFA_ENCRYPTION_KEY, NEXT_PUBLIC_APP_URL, APP_ORIGIN" >&2
  exit 1
fi

trim_value() {
  value="$1"

  value=$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  printf '%s' "$value"
}

read_var() {
  file="$1"
  key="$2"

  awk -v key="$key" '
    /^[[:space:]]*#/ { next }
    $0 ~ "^[[:space:]]*" key "=" {
      line = $0
      sub(/^[^=]*=/, "", line)
      print line
      exit
    }
  ' "$file"
}

require_var() {
  file="$1"
  key="$2"

  raw="$(read_var "$file" "$key")"
  value="$(trim_value "$raw")"

  if [ -z "$value" ]; then
    append_missing "$key"
  fi
}

append_missing() {
  key="$1"

  if [ -n "${missing_vars:-}" ]; then
    missing_vars="$missing_vars, $key"
  else
    missing_vars="$key"
  fi
}

require_value() {
  file="$1"
  key="$2"
  expected="$3"

  raw="$(read_var "$file" "$key")"
  value="$(trim_value "$raw")"

  if [ "$value" != "$expected" ]; then
    append_missing "$key"
  fi
}

read_trimmed_var() {
  file="$1"
  key="$2"

  trim_value "$(read_var "$file" "$key")"
}

require_any_var() {
  file="$1"
  label="$2"
  shift 2

  for key in "$@"; do
    value="$(read_trimmed_var "$file" "$key")"

    if [ -n "$value" ]; then
      return
    fi
  done

  append_missing "$label"
}

validate_ip_http_provider_mode() {
  provider_value="$(read_trimmed_var "$app_env" "DOUYIN_PROVIDER")"
  enable_real_providers="$(read_trimmed_var "$compose_env" "STAGING_ENABLE_REAL_PROVIDERS")"

  if [ -z "$provider_value" ]; then
    provider_value="blocked"
  fi

  case "$provider_value" in
    blocked|tikhub) ;;
    *) append_missing "DOUYIN_PROVIDER"; return ;;
  esac

  case "$enable_real_providers" in
    "")
      if [ "$provider_value" != "blocked" ]; then
        append_missing "STAGING_ENABLE_REAL_PROVIDERS"
      fi
      ;;
    0)
      if [ "$provider_value" != "blocked" ]; then
        append_missing "DOUYIN_PROVIDER"
      fi
      ;;
    1)
      if [ "$provider_value" != "tikhub" ]; then
        append_missing "DOUYIN_PROVIDER"
        return
      fi

      require_var "$app_env" "TIKHUB_API_KEY"
      require_var "$app_env" "TIKHUB_API_BASE_URL"
      require_any_var \
        "$app_env" \
        "VOLCENGINE_ASR_ENDPOINT or VOLCENGINE_ASR_SUBMIT_ENDPOINT" \
        "VOLCENGINE_ASR_ENDPOINT" \
        "VOLCENGINE_ASR_SUBMIT_ENDPOINT"
      require_var "$app_env" "VOLCENGINE_ASR_API_KEY"
      require_var "$app_env" "VOLCENGINE_ASR_RESOURCE_ID"
      require_var "$app_env" "DEEPSEEK_API_KEY"
      require_var "$app_env" "DEEPSEEK_API_BASE_URL"
      require_var "$app_env" "DEEPSEEK_MODEL"
      validate_media_relay_mode
      ;;
    *)
      append_missing "STAGING_ENABLE_REAL_PROVIDERS"
      ;;
  esac
}

validate_media_relay_mode() {
  media_relay_enabled="$(read_trimmed_var "$app_env" "MEDIA_RELAY_ENABLED")"

  case "$media_relay_enabled" in
    ""|0|false|FALSE) return ;;
    1|true|TRUE)
      require_var "$app_env" "COS_BUCKET"
      require_var "$app_env" "COS_REGION"
      require_var "$app_env" "COS_ENDPOINT"
      require_var "$app_env" "COS_ACCESS_KEY_ID"
      require_var "$app_env" "COS_SECRET_ACCESS_KEY"
      require_var "$app_env" "MEDIA_RELAY_PUBLIC_BASE_URL"
      ;;
    *)
      append_missing "MEDIA_RELAY_ENABLED"
      ;;
  esac
}

missing_vars=""

require_var "$compose_env" "POSTGRES_PASSWORD"
require_var "$app_env" "DATABASE_URL"
require_var "$app_env" "SESSION_SECRET"
require_var "$app_env" "ADMIN_MFA_ENCRYPTION_KEY"
require_var "$app_env" "NEXT_PUBLIC_APP_URL"
require_var "$app_env" "APP_ORIGIN"

case "$deploy_mode" in
  standard)
    require_var "$compose_env" "APP_DOMAIN"
    require_var "$compose_env" "EDGEONE_ORIGIN_SECRET"
    require_value "$app_env" "SESSION_COOKIE_SECURE" "true"
    ;;
  ip-http)
    require_value "$compose_env" "STAGING_ALLOW_IP_HTTP" "1"
    require_value "$app_env" "SESSION_COOKIE_SECURE" "false"
    validate_ip_http_provider_mode
    ;;
  *)
    echo "Invalid deploy mode" >&2
    exit 2
    ;;
esac

if [ -n "$missing_vars" ]; then
  echo "Missing required environment variables: $missing_vars" >&2
  exit 1
fi
