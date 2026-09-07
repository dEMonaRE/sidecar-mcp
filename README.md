# sidecar-mcp

An MCP server that delegates bulk file reading to a cheap worker LLM, so the main agent's context stays small.

When the main agent needs to understand 2+ files or any file over ~100 lines, it calls `bulk_read`. The full file content never enters the main agent's context — only the worker's summary does. Inspired by [Spotify's internal `shunt` plugin](https://github.com/spotify/portal-ai-plugins/tree/main/plugins/shunt), but generic and backend-pluggable.

## Install

sidecar-mcp is a small stdio subprocess that sits next to your coding agent. Reads happen out-of-band to a cheap worker LLM, so the main agent's context stays small. Two install paths — both wired in under a minute.

### A. From npm (once the package is on the npm registry)

The three blocks below use `claude mcp add` because it's the shortest way to register an MCP server — but `claude` here is **Claude Code's CLI**, nothing more. `sidecar-mcp` itself doesn't depend on Claude. The `SIDECAR_BACKEND=openai` env var picks which API the *worker* model uses; it's independent of the client. (For non-Claude clients, see **Wire into any MCP client** below.)

```bash
# Ollama — local, free, no API key:
claude mcp add sidecar -e SIDECAR_BACKEND=ollama -- npx -y sidecar-mcp

# OpenAI:
claude mcp add sidecar -e SIDECAR_BACKEND=openai -e SIDECAR_OPENAI_KEY="$OPENAI_API_KEY" -- npx -y sidecar-mcp

# Anthropic (or any Anthropic-compatible provider):
claude mcp add sidecar -e SIDECAR_BACKEND=anthropic -e SIDECAR_ANTHROPIC_KEY="$ANTHROPIC_API_KEY" -- npx -y sidecar-mcp
```

`npx -y sidecar-mcp` downloads and runs the published package on first call. No clone, no build, no `node_modules` to manage.

### B. From source (works today, no publish needed)

```bash
git clone https://github.com/dEMonaRE/sidecar-mcp.git
cd sidecar-mcp
pnpm install --frozen-lockfile
pnpm build
claude mcp add sidecar -e SIDECAR_BACKEND=ollama -- node "$PWD/dist/index.js"
```

### Pick a backend

| Backend | Cost | Needs |
|---|---|---|
| `ollama` | free, local | `ollama serve` + `ollama pull llama3.1:8b` |
| `openai` | $$ | `SIDECAR_OPENAI_KEY` |
| `anthropic` | $$ | `SIDECAR_ANTHROPIC_KEY` (works with Anthropic-compatible providers via `SIDECAR_ANTHROPIC_URL`) |

### Verify

In your MCP client (Claude Code shown), ask: *"Use bulk_read to summarize README.md."* You should see `bulk_read` fire and return a tight summary. Every reply ends with a usage footer (`tokens: <prompt> in / <completion> out`):

```
---
sidecar: model=llama3.1:8b, backend=ollama, tokens=412 in / 87 out
```

If `bulk_read` doesn't show up:
- **Claude Code**: `claude mcp list` should show `sidecar` as connected.
- **VS Code Copilot**: Command Palette → "MCP: List Servers".
- **Codex CLI**: `codex mcp list`.
- **Cursor / Zed**: check the MCP panel in settings.

### Other clients (VS Code Copilot, Codex CLI, Cursor, Zed, …)

`sidecar-mcp` speaks plain MCP stdio — the same primitive every MCP client consumes. The `claude mcp add` commands above are just Claude Code's CLI wrapper for the same config. See **Wire into any MCP client** below for the canonical shape and where each client stores it.

## Configuration

`sidecar-mcp` reads everything from env vars. No config file. No CLI flags (MCP stdio can't pass them).

| Var | Default | Notes |
|---|---|---|
| `SIDECAR_BACKEND` | `ollama` | `ollama` \| `openai` \| `anthropic` \| `fake` |
| `SIDECAR_MODEL` | per-backend default | see below |
| `SIDECAR_OLLAMA_URL` | `http://127.0.0.1:11434` | |
| `SIDECAR_OPENAI_URL` | `https://api.openai.com` | any OpenAI-compatible endpoint |
| `SIDECAR_OPENAI_KEY` | _required for openai_ | |
| `SIDECAR_ANTHROPIC_URL` | `https://api.anthropic.com` | any Anthropic-compatible endpoint |
| `SIDECAR_ANTHROPIC_KEY` | _required for anthropic_ | also accepts Anthropic-compatible providers |
| `SIDECAR_FILE_MAX_BYTES` | `524288` (512 KB) | files larger are skipped + reported |
| `SIDECAR_ALLOW_ROOTS` | cwd | comma-separated absolute paths |
| `SIDECAR_REQUEST_TIMEOUT_MS` | `120000` | |
| `SIDECAR_LOG_LEVEL` | `info` | `error` \| `info` \| `debug` |

**Default models:**
- ollama → `llama3.1:8b`
- openai → `gpt-4o-mini`
- anthropic → `claude-3-5-haiku-latest`

### Per-backend quick config

**Ollama (local, free, no API key)**
```bash
ollama serve &
ollama pull llama3.1:8b
export SIDECAR_BACKEND=ollama
```

**OpenAI**
```bash
export SIDECAR_BACKEND=openai
export SIDECAR_OPENAI_KEY=sk-...
```

**Anthropic (or any Anthropic-compatible provider)**
```bash
export SIDECAR_BACKEND=anthropic
export SIDECAR_ANTHROPIC_KEY=sk-ant-...
# Optional — point at a proxy that speaks the Anthropic Messages API:
# export SIDECAR_ANTHROPIC_URL=https://your-anthropic-compatible-host
```

## Wire into any MCP client

The MCP spec is the same everywhere — `sidecar-mcp` is a subprocess with a command and some env vars. Every MCP client wraps that primitive in its own config syntax, but the primitive itself doesn't change.

**Canonical shape** (the only thing you actually need to know):

```json
{
  "command": "npx -y sidecar-mcp",
  "env": { "SIDECAR_BACKEND": "ollama" }
}
```

For a from-source install, swap `npx -y sidecar-mcp` for `node /absolute/path/to/sidecar-mcp/dist/index.js`.

**Where each client stores it:**

| Client | Config location | Key |
|---|---|---|
| Claude Code | `~/.claude.json` or `.mcp.json` (or `claude mcp add …`) | `mcpServers` |
| VS Code Copilot | `.vscode/settings.json` | `github.copilot.chat.mcp.servers` |
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.X]` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` |
| Zed | `~/.config/zed/settings.json` | `context_servers` |
| any other MCP client | see [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients) | — |

**Example — VS Code Copilot** (`.vscode/settings.json`):

```json
{
  "github.copilot.chat.mcp.servers": {
    "sidecar": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "sidecar-mcp"],
      "env": { "SIDECAR_BACKEND": "ollama" }
    }
  }
}
```

**Example — Codex CLI** (`~/.codex/config.toml`):

```toml
[mcp_servers.sidecar]
command = "npx"
args = ["-y", "sidecar-mcp"]

[mcp_servers.sidecar.env]
SIDECAR_BACKEND = "ollama"
```

The `command`/`args` split varies by client (some take a single string, some take an array); the primitive above is what every client is configuring.

## Tool reference

### `bulk_read`

| Field | Type | Required | Notes |
|---|---|---|---|
| `paths` | string[] | yes | 1–50 paths. Relative or absolute. |
| `question` | string | yes | what to ask the worker |
| `model` | string | no | override configured default for this call |

**Returns:** the worker's text summary. The full file content never appears in the caller's context.

**Response footer:** every `bulk_read` reply ends with a one-line footer for cost spot-checks:

```
---
sidecar: model=<model>, backend=<backend>, tokens=<in> in / <out> out
```

(or `tokens: n/a` if the backend didn't report usage). Footer is included automatically; no flag to disable in MVP.

**Example call:**
```json
{
  "paths": ["src/Service.java", "src/Handler.java"],
  "question": "What does this service do and what are its key methods?"
}
```

**Worker prompt shape** (for debugging):
```
<files>
<file path="src/Service.java">…</file>
<file path="src/Handler.java">…</file>
<!-- unreadable: path/to/binary.bin — binary file -->
</files>

<question>
What does this service do?
</question>
```

## How it works

```
main agent (Claude Sonnet — expensive)
   │
   │  MCP stdio JSON-RPC:
   │  {"method":"tools/call","params":{"name":"bulk_read", ...}}
   ▼
sidecar-mcp subprocess
   │
   │  reads files, wraps in XML, POSTs to:
   ▼
worker model (Ollama 8B / GPT-4o-mini / Claude Haiku — cheap)
   │
   │  returns ~600 token summary
   ▼
back to main agent as tool result
```

The full file content stays between `sidecar-mcp` and the worker. The main agent only ever sees the summary.

## Limitations

- **Non-streaming.** Worker replies are returned as one text blob.
- **No `code_write`.** Bulk boilerplate generation is out of scope for MVP. If you need it, build a separate tool.
- **Claude Code hook layer is opt-in.** Auto-redirect of large `Read`/`Bash cat|head|tail` calls to `bulk_read` lives in `extras/claude-hooks/` and is **not** installed by default. See `extras/claude-hooks/README.md` to wire it into `~/.claude/settings.json`.
- **`SIDECAR_ALLOW_ROOTS` defaults to cwd.** Files outside are skipped with a warning. Set explicitly for stricter scoping.

## Development

```bash
git clone https://github.com/dEMonaRE/sidecar-mcp.git
cd sidecar-mcp
pnpm install
pnpm dev          # run with tsx watch
pnpm test         # vitest
pnpm demo         # offline self-check (fake backend, prints prompt + reply)
pnpm build        # tsc → dist/
pnpm pack         # build a tarball to verify before publishing
```

**Manual smoke test with real Ollama:**
```bash
ollama serve &
ollama pull llama3.1:8b
SIDECAR_BACKEND=ollama sidecar-mcp &   # in one terminal
# Wire into your MCP client (Claude Code, Copilot, Codex) and call bulk_read.
```

## License

MIT — see [LICENSE](./LICENSE).
