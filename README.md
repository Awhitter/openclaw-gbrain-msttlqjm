# OpenClaw + AlphaClaw + GBrain on Render

## GBrain browser deployment

The deployed conversational profile uses GPT-6 Astra with high reasoning and Claude Opus 5.5 as a provider fallback. Browser mode authenticates providers through Render's existing environment. Wrapper-side credential updates are normalized with OpenClaw's supported public migration command before use; no private OpenClaw module names are relied upon.

The managed deployment pins AlphaClaw **0.9.36**, OpenClaw **2026.9.8**, and GBrain **v0.60.32.0** (commit `48ed5e8233f617479df989998560840747af0425`). OpenClaw's patch release is explicitly overridden and tested with the wrapper's real onboarding sequence.

`GBRAIN_WEB_CHAT=1` enables authenticated browser-only onboarding. Submit that same flag and a provider credential to the existing `/api/onboard` endpoint with the selected model. This mode uses the persistent workspace without requiring GitHub or a Slack bot. Normal channel-based onboarding is unchanged. GitHub sync is not configured in this mode. The existing setup password and gateway token remain required.

After onboarding, use AlphaClaw's OpenClaw dashboard link for browser chat. This deployment connects the agent to both Katailyst2 and a single loopback GBrain HTTP MCP server. The memory service owns PGLite so concurrent conversations cannot launch competing database processes. Scoped memory credentials are created before the service starts and retained in private files on the persistent disk; tokens never appear in startup logs. If either required service exits, the container exits so Render can restart the complete runtime.

Versioned GBrain skills load directly from `/app/skills-seed`, with deployment guidance from `/app/managed-skills`. Old copies in `/data/skills` are retained but not automatically preferred over the current release. Custom skills belong in the OpenClaw workspace's `skills` directory. Use MCP memory tools rather than database-opening CLI commands while the shared memory service runs.

Upgrades retain a pre-migration disk copy. That copy shares the production disk and is not an offsite backup. Provider-managed disk snapshots should be verified separately. No paid bulk ingestion or background re-embedding is started automatically.

Validation: `node --test tests/*.test.cjs` exercises real isolated OpenClaw onboarding and config validation; `python3 -m unittest discover -s tests` checks migration and backup behavior. The real onboarding test may fetch OpenClaw's required Codex runtime from npm, so it needs network access. It uses fixture provider credentials and sends no model request.

> [!TIP]
> **Render sponsors AlphaClaw.**
>
> Redeem $50 in Render hosting credits with code `RENDER-ALPHACLAW`.

One-click Render deploy for [OpenClaw](https://github.com/openclaw/openclaw) wrapped in [AlphaClaw](https://github.com/chrysb/alphaclaw), with [GBrain](https://github.com/garrytan/gbrain) pre-installed as a skill pack so your agent has a persistent, hybrid-searchable knowledge brain from the moment it boots.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy-template/api/github/start?template_repo=openclaw-gbrain)

## What you get

- **AlphaClaw + OpenClaw**, same setup as the [base Render template](https://github.com/chrysb/openclaw-render-template): browser-based setup wizard, watchdog, in-app updates handled by Render.
- **GBrain**, a Postgres-native knowledge brain with hybrid search (vector + keyword + RRF fusion + multi-query expansion), running on embedded **PGLite** so the brain lives entirely in-process — no external database to manage.
- **GBrain skill pack** loaded from the versioned image (ingest, query, maintain, enrich, briefing, install, and more).
- **One container, one disk.** No external Postgres, no second billing line, no second dashboard.

## What this template provisions

| Resource | Plan | Notes |
| --- | --- | --- |
| Web service (Docker) | Pro (4 GB) | AlphaClaw + OpenClaw + GBrain CLI + PGLite brain in-process. Pro gives ~50% headroom over OpenClaw's 2 GB minimum and survives bulk ingestion spikes. |
| Persistent disk | 10 GB at `/data` | AlphaClaw state, OpenClaw memory index, GBrain PGLite brain file, GBrain config. |

Check [render.com/pricing](https://render.com/pricing) for current rates.

### Sizing guidance

PGLite runs in a supervised process alongside the OpenClaw gateway, so memory pressure scales with brain size on top of the gateway baseline. Rough guidance:

| Brain size | Recommended plan |
| --- | --- |
| Empty / demo (< 500 pages) | Standard (2 GB) — try-it-out only |
| Small to medium (up to a few thousand pages) | Pro (4 GB) — the template default |
| Large (10k+ pages, regular bulk ingest) | Pro Plus (8 GB) or higher |

Watch the **Metrics** tab after a week of real use. If sustained memory creeps above ~75%, bump the plan — vertical scaling is your only option here (the persistent disk caps you at one instance).

## Before you deploy

You need two API keys:

| Key | Used by | Where to get it |
| --- | --- | --- |
| `OPENAI_API_KEY` | GBrain embeddings (`text-embedding-3-large`) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | GBrain multi-query expansion + LLM chunking (Haiku) | [console.anthropic.com](https://console.anthropic.com) |

Both are required by this template's entrypoint. If you want to run GBrain in degraded mode (keyword search only, no embeddings), remove the `require_env` checks in `entrypoint.sh` before deploying.

Initial embedding cost is roughly $4-5 per 7,500 pages.

## Deploy

1. Click the **Deploy to Render** button above.
2. Render provisions the web service and disk from `render.yaml`.
3. On the web service config screen, fill in `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. `SETUP_PASSWORD` and `OPENCLAW_GATEWAY_TOKEN` are generated automatically.
4. Wait for the first deploy. The entrypoint will:
   1. Run `gbrain init --pglite` to create the brain file at `/data/.gbrain/brain.pglite` and apply the schema.
   2. Seed the GBrain skills into `/data/skills`.
   3. Start AlphaClaw.
5. Visit your Render URL, enter `SETUP_PASSWORD`, and complete the AlphaClaw welcome wizard.

## First conversation with your brain

Once the welcome wizard finishes, your agent already knows how to use GBrain. Try:

```
You: How many pages are in the brain right now?
You: Import the markdown files at <some path on the disk or a git repo>
You: Search the brain for everything we know about <topic>
You: Give me a briefing for tomorrow
```

OpenClaw reads the versioned skill files and uses the shared GBrain MCP service. You do not need to touch the CLI.

## Importing your existing knowledge base

GBrain is designed to ingest your existing markdown. Two patterns work well on Render:

**Option A: paste in chat.** Drop markdown into AlphaClaw's chat; the `ingest` skill writes it to the brain.

**Option B: git pull on the persistent disk.** SSH into the service (`render ssh`) and clone your knowledge repo into `/data/repos/<name>`, then in chat: "Import the markdown at `/data/repos/<name>`." The `install` skill handles `gbrain sync --watch` setup if you want incremental sync.

Binary attachments (images, PDFs, audio) are not supported on this template. GBrain's `files` commands assume Supabase Storage; we would need to add Render Object Storage support upstream to wire those up. Text-only is the v1 scope.

## What is in the box

```
.
├── render.yaml         # Render Blueprint: single web service + disk
├── Dockerfile          # AlphaClaw (Node) + GBrain (Bun, installed from GitHub)
├── entrypoint.sh       # gbrain init (PGLite), skills seed, exec alphaclaw
├── package.json        # Pins @chrysb/alphaclaw
└── README.md
```

The skills themselves are not committed here. They are pulled from the GBrain repo at Docker build time, staged into `/app/skills-seed`, and copied to `/data/skills` on first boot. The skills always match the GBrain version you are running (pinned by SHA via the `GBRAIN_REF` build arg in the Dockerfile).

## Updating

- **AlphaClaw / OpenClaw**: In-app updates are disabled for Render-managed deploys as of AlphaClaw 0.9.0. Bump `@chrysb/alphaclaw` in `package.json` and redeploy.
- **GBrain**: The image installs GBrain at the commit pinned by the `GBRAIN_REF` build arg in the Dockerfile. To upgrade, bump `GBRAIN_REF` to a newer commit from [garrytan/gbrain](https://github.com/garrytan/gbrain) and redeploy. On boot, `gbrain init` is idempotent and applies any pending schema migrations.
- **Schema migrations**: `gbrain init` only runs on the first boot of a fresh disk (gated by the presence of `/data/.gbrain/config.json`). To force a re-run after a major GBrain upgrade, `render ssh` in and execute `gbrain apply-migrations --yes --non-interactive`.

## Why PGLite instead of Render Managed Postgres?

An earlier iteration of this template provisioned a Render Postgres alongside the web service. It does not work: several GBrain schema migrations require the connecting role to hold the `BYPASSRLS` attribute (v24, v29, v31), and migration v35 requires superuser to `CREATE EVENT TRIGGER`. Render Managed Postgres never grants either to user roles, so GBrain's schema cannot fully apply against a Render Postgres instance.

PGLite ([@electric-sql/pglite](https://github.com/electric-sql/pglite)) is GBrain's default engine: Postgres compiled to WebAssembly, running in-process, with `pgvector` and `pg_trgm` bundled in. Every BYPASSRLS-gated migration is a hardcoded no-op on PGLite, and there is no separate role hierarchy to constrain `CREATE EVENT TRIGGER`. The trade-off is that the brain is single-instance (only the running container can open the brain file), which already matches this template's persistent-disk architecture.

## Troubleshooting

**Container OOMs on startup.** Standard (2 GB) is the floor for OpenClaw's gateway alone; do not downgrade to Starter. The template defaults to Pro (4 GB) because PGLite runs in the same process. If you're on Standard and seeing OOMs, bump to Pro.

**Container OOMs during ingestion.** Bulk ingest (importing thousands of pages at once) is the peak-memory moment for this template. Embedding batches plus PGLite working memory can push past 4 GB on a large brain. Either ingest in smaller batches, or temporarily scale up to Pro Plus (8 GB) for the initial seed and scale back to Pro afterward.

**Embeddings stuck at 0.** Check the service logs for OpenAI rate limit errors. GBrain backs off automatically. If `OPENAI_API_KEY` is missing or invalid, search still works in keyword-only mode.

**Skills not appearing in OpenClaw.** Confirm `/data/skills` is populated after first boot (`render ssh` into the service and `ls /data/skills`). The entrypoint uses `cp -rn` so it will never overwrite user edits, but it also will not re-seed if the directory exists.

**Brain file missing after redeploy.** The brain lives at `/data/.gbrain/brain.pglite`. Confirm the persistent disk is still attached and mounted at `/data`. If you accidentally recreate the disk, the brain is gone — restore from the latest Render disk snapshot.

## Limitations

- **Single-instance only.** PGLite (like the disk it lives on) can only be opened by one process at a time. This template does not support horizontal scaling or zero-downtime deploys. Render restarts the container on deploy, which briefly drops connections.
- **Binary attachments**: not supported. GBrain's `files` subsystem expects Supabase Storage.
- **Multi-region**: this template deploys to `oregon`. Change `region` in `render.yaml` if you need a different region; the disk must match the service.
- **Backup**: AlphaClaw handles application-level disk backups via cron. Render disk snapshots provide block-level backups. Verify both are working before you put real knowledge into the brain.

## License

MIT for the template itself. AlphaClaw, OpenClaw, and GBrain each ship under their own licenses (MIT at last check). See upstream repos.

## Pinned upgrade (2026-10-02)

The image pins Node 24.21.0, Bun 1.4.2, AlphaClaw 0.9.36 (OpenClaw
2026.9.3), and GBrain stable commit
`d44296cf4d6481a10eb85562d3179e38cfd02c43` (0.60.30.0).
`npm ci` uses the checked-in lockfile; a failed GBrain installation fails the build.

On the first boot of a new image revision, an existing brain is copied to
`/data/backups/gbrain-before-<revision>` before migrations run. A failed migration
prevents AlphaClaw from starting and preserves that original copy for recovery.
Subsequent boots skip completed migrations. Automatic background-service
installation and re-embedding are disabled during this memory-only upgrade.
Keep the persistent disk attached; never restore over a running PGLite process.

### K2 connection

AlphaClaw's native remote MCP configuration uses these Render environment variables:

- `REMOTE_MCP_NAME=katailyst2`
- `REMOTE_MCP_URL=https://katailyst2.vercel.app/api/mcp`
- `REMOTE_MCP_API_TOKEN`: a dedicated K2 credential for this agent, stored privately
  through the deployment environment. Do not reuse Mira's or another agent's token.

The gateway stores a variable reference instead of the bearer value in its JSON
configuration. Setting these variables alone is not activation: finish onboarding,
then verify a real K2 tool call through OpenClaw. The setup wizard requires a
separate chat-channel credential and a workspace repository. `/health` can return
HTTP 200 before onboarding; check authenticated `/api/onboard/status` and
`/api/status` before reporting readiness.

Focused entrypoint proof: `python3 -m unittest discover -s tests -v`.
