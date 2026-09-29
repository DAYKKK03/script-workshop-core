#!/bin/sh
set -eu

PRESERVATION_SCRIPT_PID=$$
export PRESERVATION_SCRIPT_PID

# This is deliberately separate from backup.sh: preservation must never enter its
# loop or retention-deletion path.
status() {
  printf '%s\n' "$1"
}

fail() {
  status "BACKUP_STATUS=$1"
  exit 1
}

if [ "${BACKUP_ONESHOT_EXECUTION:-}" != "server-only" ]; then
  status "BACKUP_STATUS=BLOCKED_EXECUTION_SCOPE"
  exit 2
fi

if [ "${BACKUP_ONESHOT_CONFIRMED:-}" != "preserve-database" ]; then
  status "BACKUP_STATUS=BLOCKED_CONFIRMATION"
  exit 2
fi

if [ -z "${BACKUP_AGE_RECIPIENT:-}" ] || [ -z "${COS_BUCKET:-}" ] || [ -z "${COS_REGION:-}" ] || [ -z "${COS_ENDPOINT:-}" ] || [ -z "${COS_ACCESS_KEY_ID:-}" ] || [ -z "${COS_SECRET_ACCESS_KEY:-}" ] || [ -z "${BACKUP_OUTPUT_DIR:-}" ]; then
  status "BACKUP_STATUS=BLOCKED_CONFIGURATION"
  exit 2
fi

case "$BACKUP_OUTPUT_DIR" in
  /*) ;;
  *) status "BACKUP_STATUS=BLOCKED_OUTPUT_PATH"; exit 2 ;;
esac

umask 077
mkdir -p "$BACKUP_OUTPUT_DIR"

export RCLONE_CONFIG_COS_TYPE=s3
export RCLONE_CONFIG_COS_PROVIDER=TencentCOS
export RCLONE_CONFIG_COS_ACCESS_KEY_ID="$COS_ACCESS_KEY_ID"
export RCLONE_CONFIG_COS_SECRET_ACCESS_KEY="$COS_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_COS_REGION="$COS_REGION"
export RCLONE_CONFIG_COS_ENDPOINT="$COS_ENDPOINT"

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
nonce="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
base="database_${stamp}_${nonce}.dump"
plain="$BACKUP_OUTPUT_DIR/.${base}.plain"
encrypted="$BACKUP_OUTPUT_DIR/${base}.age"
manifest="$BACKUP_OUTPUT_DIR/${base}.age.manifest"

cleanup_plain() {
  [ -z "$plain" ] || rm -f "$plain" || :
}

active_child_pid=""
active_child_group_file=""
child_stop_grace_seconds=2

start_isolated_child() {
  active_child_group_file="$(mktemp "${TMPDIR:-/tmp}/preservation-child.XXXXXX")"
  PRESERVATION_GROUP_PID_FILE="$active_child_group_file"
  export PRESERVATION_GROUP_PID_FILE
  /usr/bin/perl -MPOSIX=setsid -e '
    my $leader = fork();
    defined $leader or exit 1;
    if ($leader == 0) {
      setsid() or exit 1;
      open(my $group, ">", $ENV{PRESERVATION_GROUP_PID_FILE}) or exit 1;
      print $group $$;
      close($group);
      exec { $ARGV[0] } @ARGV;
      exit 127;
    }
    while (!-s $ENV{PRESERVATION_GROUP_PID_FILE}) { select(undef, undef, undef, 0.01); }
    open(my $group, "<", $ENV{PRESERVATION_GROUP_PID_FILE}) or exit 1;
    my $pgid = <$group>;
    close($group);
    $pgid =~ /^[0-9]+$/ or exit 1;
    waitpid($leader, 0);
    my $child_status = $?;
    # The tracker remains outside the isolated group, so kill(0, -PGID)
    # observes descendants after their group leader has exited.
    while (kill(0, -$pgid)) { select(undef, undef, undef, 0.05); }
    exit(($child_status >> 8) || 0);
  ' "$@" &
  active_child_pid=$!
  for readiness_attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    [ -s "$active_child_group_file" ] && return 0
    sleep 0.1
  done
  /bin/kill -TERM "$active_child_pid" 2>/dev/null || :
  wait "$active_child_pid" 2>/dev/null || :
  clear_active_child
  return 1
}

clear_active_child() {
  [ -z "$active_child_group_file" ] || rm -f "$active_child_group_file" || :
  active_child_group_file=""
  active_child_pid=""
}

run_tracked_quiet() {
  start_isolated_child "$@" >/dev/null 2>&1 || return 1
  if wait "$active_child_pid"; then
    clear_active_child
    return 0
  fi
  clear_active_child
  return 1
}

run_tracked_to_file() {
  output_file="$1"
  shift
  start_isolated_child "$@" >"$output_file" 2>/dev/null || return 1
  if wait "$active_child_pid"; then
    clear_active_child
    return 0
  fi
  clear_active_child
  return 1
}

stop_active_child() {
  signal_number="$1"
  child_pid="${active_child_pid:-}"
  [ -n "$child_pid" ] || return 0
  child_group_pid="$(cat "$active_child_group_file" 2>/dev/null || :)"
  case "$child_group_pid" in *[!0-9]*|"") /bin/kill "-$signal_number" "$child_pid" 2>/dev/null || : ;; *) /bin/kill "-$signal_number" -- "-$child_group_pid" 2>/dev/null || : ;; esac
  (
    trap 'exit 0' HUP INT TERM
    sleep "$child_stop_grace_seconds"
    case "$child_group_pid" in *[!0-9]*|"") /bin/kill -KILL "$child_pid" 2>/dev/null || : ;; *) /bin/kill -KILL -- "-$child_group_pid" 2>/dev/null || : ;; esac
  ) </dev/null >/dev/null 2>&1 &
  watchdog_pid=$!
  wait "$child_pid" 2>/dev/null || :
  wait "$watchdog_pid" 2>/dev/null || :
  clear_active_child
}

on_exit() {
  cleanup_plain
}

on_signal() {
  signal_name="$1"
  exit_code="$2"
  trap '' HUP INT TERM
  stop_active_child "$signal_name"
  cleanup_plain
  status "BACKUP_STATUS=INTERRUPTED"
  exit "$exit_code"
}

trap on_exit EXIT
trap 'on_signal HUP 129' HUP
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

if ! run_tracked_to_file "$plain" pg_dump --format=custom --no-owner --no-acl; then
  fail "FAILED_DUMP"
fi

if ! run_tracked_quiet age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted" "$plain"; then
  fail "FAILED_ENCRYPTION"
fi

archive_sha256="$(sha256sum "$encrypted" | awk '{print $1}')"
archive_bytes="$(wc -c <"$encrypted" | tr -d ' ')"
case "$archive_sha256" in
  *[!0-9a-f]*|"") fail "FAILED_LOCAL_INTEGRITY" ;;
esac
case "$archive_bytes" in
  *[!0-9]*|"") fail "FAILED_LOCAL_INTEGRITY" ;;
esac

printf 'archive_sha256=%s\narchive_bytes=%s\n' "$archive_sha256" "$archive_bytes" >"$manifest"

remote_archive="cos:${COS_BUCKET}/preservation/${base}.age"
remote_manifest="${remote_archive}.manifest"

# --immutable makes an existing object a hard failure; no retry can replace it.
if ! run_tracked_quiet rclone copyto --immutable "$encrypted" "$remote_archive"; then
  fail "FAILED_UPLOAD"
fi
if ! run_tracked_quiet rclone check "$encrypted" "$remote_archive" --one-way; then
  fail "FAILED_REMOTE_INTEGRITY"
fi
if ! run_tracked_quiet rclone copyto --immutable "$manifest" "$remote_manifest"; then
  fail "FAILED_MANIFEST_UPLOAD"
fi
if ! run_tracked_quiet rclone check "$manifest" "$remote_manifest" --one-way; then
  fail "FAILED_MANIFEST_INTEGRITY"
fi

status "BACKUP_STATUS=VERIFIED_UPLOAD bytes=$archive_bytes sha256_prefix=$(printf '%s' "$archive_sha256" | cut -c1-12)"
