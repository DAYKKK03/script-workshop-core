#!/bin/sh
set -eu

PRESERVATION_SCRIPT_PID=$$
export PRESERVATION_SCRIPT_PID

# This command only rehearses a local, disposable PostgreSQL target. It never
# downloads an archive or accepts a production/staging connection string.
status() {
  printf '%s\n' "$1"
}

fail() {
  status "RESTORE_STATUS=$1"
  exit 1
}

if [ "${RESTORE_REHEARSAL_EXECUTION:-}" != "ops-only" ] || [ "${RESTORE_REHEARSAL_CONFIRMED:-}" != "restore-isolated-test" ]; then
  status "RESTORE_STATUS=BLOCKED_CONFIRMATION"
  exit 2
fi

if [ -z "${RESTORE_REHEARSAL_ARCHIVE:-}" ] || [ -z "${RESTORE_REHEARSAL_MANIFEST:-}" ] || [ -z "${RESTORE_REHEARSAL_AGE_IDENTITY_FILE:-}" ]; then
  status "RESTORE_STATUS=BLOCKED_CONFIGURATION"
  exit 2
fi

# A caller may not choose a restore target. Legacy target variables are rejected
# rather than parsed, so libpq overrides cannot affect the disposable database.
if [ -n "${RESTORE_REHEARSAL_TEST_DATABASE_URL:-}" ] || [ -n "${RESTORE_REHEARSAL_TEST_DATABASE_NAME:-}" ]; then
  status "RESTORE_STATUS=BLOCKED_TARGET"
  exit 2
fi

file_owner() {
  stat -f '%u' "$1" 2>/dev/null || stat -c '%u' "$1" 2>/dev/null
}

file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null
}

is_owner_only_source_file() {
  source_file="$1"
  case "$source_file" in /*) ;; *) return 1 ;; esac
  [ -L "$source_file" ] && return 1
  [ -f "$source_file" ] || return 1
  source_parent="$(dirname "$source_file")"
  [ -L "$source_parent" ] && return 1
  [ -d "$source_parent" ] || return 1
  canonical_parent="$(cd "$source_parent" 2>/dev/null && pwd -P)" || return 1
  [ "$(file_owner "$source_file")" = "$(id -u)" ] || return 1
  [ "$(file_owner "$canonical_parent")" = "$(id -u)" ] || return 1
  source_file_mode="$(file_mode "$source_file")"
  source_parent_mode="$(file_mode "$canonical_parent")"
  case "$source_file_mode" in [0-7]00) ;; *) return 1 ;; esac
  case "$source_parent_mode" in [0-7]00) ;; *) return 1 ;; esac
}

if ! is_owner_only_source_file "$RESTORE_REHEARSAL_ARCHIVE" || ! is_owner_only_source_file "$RESTORE_REHEARSAL_MANIFEST" || ! is_owner_only_source_file "$RESTORE_REHEARSAL_AGE_IDENTITY_FILE"; then
  status "RESTORE_STATUS=BLOCKED_ARTIFACT"
  exit 2
fi

umask 077
snapshot_dir="$(mktemp -d "${TMPDIR:-/tmp}/restore-rehearsal.XXXXXX")"
plain="$snapshot_dir/plain.dump"
snapshot_archive="$snapshot_dir/archive.age"
snapshot_manifest="$snapshot_dir/archive.manifest"
snapshot_identity="$snapshot_dir/identity"
temporary_database_creation_attempted=0
temporary_database_created=0
temporary_database_cleanup_attempted=0
interrupted=0
cleanup_timeout_seconds=5
maintenance_url="postgresql://127.0.0.1/postgres"
database_nonce="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
temporary_database_name="restore_rehearsal_${database_nonce}_test"
temporary_database_url="postgresql://127.0.0.1/$temporary_database_name"
active_child_pid=""
active_child_group_file=""
child_stop_grace_seconds=2

cleanup_plain() {
  [ -z "$plain" ] || rm -f "$plain" || :
}

cleanup_snapshot() {
  [ -z "$snapshot_dir" ] || rm -rf "$snapshot_dir" || :
}

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

cleanup_temporary_database() {
  if [ "$temporary_database_created" != 1 ] && { [ "$interrupted" != 1 ] || [ "$temporary_database_creation_attempted" != 1 ]; }; then
    return 0
  fi
  [ "$temporary_database_cleanup_attempted" = 0 ] || return 0
  temporary_database_cleanup_attempted=1
  temporary_database_created=0
  PGCONNECT_TIMEOUT="$cleanup_timeout_seconds" PGOPTIONS="-c lock_timeout=${cleanup_timeout_seconds}000 -c statement_timeout=${cleanup_timeout_seconds}000" \
    dropdb --if-exists --force --maintenance-db="$maintenance_url" "$temporary_database_name" >/dev/null 2>&1
}

on_exit() {
  exit_code=$?
  cleanup_plain
  cleanup_temporary_database || :
  cleanup_snapshot
  trap - EXIT
  exit "$exit_code"
}

on_signal() {
  signal_name="$1"
  exit_code="$2"
  trap '' HUP INT TERM
  interrupted=1
  stop_active_child "$signal_name"
  cleanup_plain
  cleanup_temporary_database || :
  cleanup_snapshot
  status "RESTORE_STATUS=INTERRUPTED"
  exit "$exit_code"
}

trap on_exit EXIT
trap 'on_signal HUP 129' HUP
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

if ! cp -P "$RESTORE_REHEARSAL_ARCHIVE" "$snapshot_archive" >/dev/null 2>&1 || ! cp -P "$RESTORE_REHEARSAL_MANIFEST" "$snapshot_manifest" >/dev/null 2>&1 || ! cp -P "$RESTORE_REHEARSAL_AGE_IDENTITY_FILE" "$snapshot_identity" >/dev/null 2>&1; then
  status "RESTORE_STATUS=BLOCKED_ARTIFACT"
  exit 2
fi
if [ -L "$snapshot_archive" ] || [ -L "$snapshot_manifest" ] || [ -L "$snapshot_identity" ] || [ ! -f "$snapshot_archive" ] || [ ! -f "$snapshot_manifest" ] || [ ! -f "$snapshot_identity" ]; then
  status "RESTORE_STATUS=BLOCKED_ARTIFACT"
  exit 2
fi
chmod 600 "$snapshot_archive" "$snapshot_manifest" "$snapshot_identity" >/dev/null 2>&1 || { status "RESTORE_STATUS=BLOCKED_ARTIFACT"; exit 2; }

expected_sha256="$(awk -F= '$1 == "archive_sha256" { print $2 }' "$snapshot_manifest")"
expected_bytes="$(awk -F= '$1 == "archive_bytes" { print $2 }' "$snapshot_manifest")"
actual_sha256="$(sha256sum "$snapshot_archive" | awk '{print $1}')"
actual_bytes="$(wc -c <"$snapshot_archive" | tr -d ' ')"
if [ "$expected_sha256" != "$actual_sha256" ] || [ "$expected_bytes" != "$actual_bytes" ]; then
  fail "FAILED_INTEGRITY"
fi

if ! run_tracked_quiet age --decrypt --identity "$snapshot_identity" --output "$plain" "$snapshot_archive"; then
  fail "FAILED_DECRYPTION"
fi

temporary_database_creation_attempted=1
if ! run_tracked_quiet createdb --maintenance-db="$maintenance_url" "$temporary_database_name"; then
  fail "FAILED_TARGET_SETUP"
fi
temporary_database_created=1
if ! run_tracked_quiet pg_restore --no-owner --no-acl --dbname="$temporary_database_url" "$plain"; then
  fail "FAILED_RESTORE"
fi
if ! cleanup_temporary_database; then
  fail "FAILED_CLEANUP"
fi

status "RESTORE_STATUS=VERIFIED_REHEARSAL bytes=$actual_bytes sha256_prefix=$(printf '%s' "$actual_sha256" | cut -c1-12)"
