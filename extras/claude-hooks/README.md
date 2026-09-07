# sidecar-mcp Claude Code hooks

Bash scripts that intercept Claude Code's `Read` and `Bash` tool calls and redirect the agent to the MCP tool `bulk_read` when files exceed `SIDECAR_MIN_LINES` (default 350).

Self-contained — no Node deps, just `jq`.

## Install

1. `brew install jq` (macOS) or `apt install jq` (Linux).
2. Decide where the scripts will live. Two options:
   - **Project-local** (recommended): `cp extras/claude-hooks/check-file-size extras/claude-hooks/check-bash-read .claude/hooks/`
   - **User-global**: `cp extras/claude-hooks/check-file-size extras/claude-hooks/check-bash-read ~/.claude/hooks/`
3. `chmod +x <wherever>/check-file-size <wherever>/check-bash-read`
4. Paste the `hooks` block from `extras/claude-hooks/hooks.json` into:
   - `~/.claude/settings.json` (user-global), or
   - `<your-project>/.claude/settings.json` (project-local)
   Replace `<absolute-path>` in the `command` field with the absolute path where the scripts live.

## Configure

- `SIDECAR_MIN_LINES` — line-count threshold (default `350`). Override per-project via the `env` block of `.claude/settings.json`:
  ```json
  {
    "env": { "SIDECAR_MIN_LINES": "200" }
  }
  ```

## Verify

Run the smoke test:
```bash
bash extras/claude-hooks/test.sh
```

Or pipe synthetic input to a hook manually:
```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"/path/to/big-file"}}' \
  | extras/claude-hooks/check-file-size
```

## How it works

- The hook reads Claude Code's JSON on stdin.
- For `Read` calls without `offset`/`limit` on files >`SIDECAR_MIN_LINES`: deny with a `permissionDecisionReason` that tells Claude to call `bulk_read` with the same path. Claude retries with `bulk_read`.
- For `Bash` calls of `cat|head|tail|less|more` on the same: same deny + redirect.
- Piped/redirected commands, non-read commands, and short files pass through unchanged.

## Limitations

- Cannot swap the tool name directly (Claude Code hook `updatedInput` only mutates fields on the same tool). Deny + retry is the only correct path. Adds one extra turn per redirected call.
- The redirect asks a fixed question: `"summarize this file"`. The worker produces a useful summary from this generic prompt; no per-file question derivation.
