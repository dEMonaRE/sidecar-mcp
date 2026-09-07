#!/usr/bin/env bash
# POSIX smoke test for check-file-size and check-bash-read.
# Verifies allow/deny behavior on a small + a large file.
# Exits 0 on success, non-zero on first assertion failure.

set -eu

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

big="$dir/big.txt"
small="$dir/small.txt"
yes "$(printf 'a%.0s' $(seq 1 400))" | head -n 400 > "$big"
printf 'a\n%.0s' $(seq 1 10) > "$small"

dir_self=$(cd "$(dirname "$0")" && pwd)
file_hook="$dir_self/check-file-size"
bash_hook="$dir_self/check-bash-read"

assert_json_field() {
  local label="$1" json="$2" field="$3" want="$4"
  local got
  got=$(printf '%s' "$json" | jq -r "$field")
  if [ "$got" != "$want" ]; then
    printf 'FAIL [%s]: %s expected %q got %q\n' "$label" "$field" "$want" "$got" >&2
    printf '       json: %s\n' "$json" >&2
    exit 1
  fi
  printf 'ok   [%s]: %s = %q\n' "$label" "$field" "$got"
}

run_read() {
  local label="$1" path="$2" extra="$3" want="$4"
  local input json
  input=$(printf '{"tool_name":"Read","tool_input":{"file_path":"%s"%s}}' "$path" "$extra")
  json=$(printf '%s' "$input" | "$file_hook")
  assert_json_field "Read-$label" "$json" '.hookSpecificOutput.permissionDecision' "$want"
}

run_bash() {
  local label="$1" cmd="$2" want="$3"
  local input json
  input=$(printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$cmd")
  json=$(printf '%s' "$input" | "$bash_hook")
  assert_json_field "Bash-$label" "$json" '.hookSpecificOutput.permissionDecision' "$want"
}

# Read hook
run_read "big-deny"        "$big"   ''                              deny
run_read "small-allow"     "$small" ''                              allow
run_read "big-offset-allow" "$big"  ',"offset":100,"limit":50'      allow
run_read "missing-allow"   "$dir/nope.txt" ''                       allow

# Bash hook
run_bash "cat-big-deny"   "cat $big"                                deny
run_bash "cat-small-allow" "cat $small"                              allow
run_bash "cat-pipe-allow" "cat $big | grep foo"                     allow
run_bash "cat-redirect-allow" "cat $big > /tmp/x"                   allow
run_bash "git-allow"      "git status"                              allow

echo "all hook assertions passed"
