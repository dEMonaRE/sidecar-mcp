# sidecar-mcp

An MCP server that delegates bulk file reading to a cheap worker LLM, so the main agent's context stays small.

When the main agent needs to understand 2+ files or any file over ~100 lines, it calls `bulk_read`. The full file content never enters the main agent's context — only the worker's summary does. Inspired by [Spotify's internal `shunt` plugin](https://github.com/spotify/portal-ai-plugins/tree/main/plugins/shunt), but generic and backend-pluggable.

## Install

```bash
pnpm add -g sidecar-mcp
# or: npm i -g sidecar-mcp
```

Then check what env vars you need:

```bash
sidecar-mcp --help
```

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

## Usage per platform

### Claude Code

In `~/.claude.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "sidecar": {
      "command": "sidecar-mcp",
      "env": { "SIDECAR_BACKEND": "ollama" }
    }
  }
}
```

### VS Code (GitHub Copilot)

In VS Code `settings.json`:

```json
"github.copilot.chat.mcp.servers": {
  "sidecar": {
    "type": "stdio",
    "command": "sidecar-mcp",
    "env": { "SIDECAR_BACKEND": "ollama" }
  }
}
```

### Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.sidecar]
command = "sidecar-mcp"
[mcp_servers.sidecar.env]
SIDECAR_BACKEND = "ollama"
```

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
