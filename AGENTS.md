# Repository Guidelines

## Project Structure & Module Organization
This repo packages the authless Meta-MCP builder for Cloudflare Workers. Authoritative code lives in `src/index.ts`, which defines the `McpAgent` implementation and registers tools/resources. Worker configuration files (`wrangler.jsonc`, `worker-configuration.d.ts`) and scripts (`deploy.sh`) sit at the root. Generated artifacts are emitted to `dist/` during deployment; avoid editing them by hand. Documentation such as `README.md`, `CLOUDFLARE_ACCESS_INCOMPATIBILITY.md`, and `test-connection.md` describe connection flows and should be updated whenever tool behavior changes.

## Build, Test, and Development Commands
- `npm install` syncs dependencies pinned in `package-lock.json`.
- `npm run dev` (Wrangler dev server) exposes `http://localhost:8787/sse` with live reload.
- `npm run type-check` runs `tsc --noEmit` to keep Durable Object contracts strict.
- `npm run cf-typegen` refreshes Cloudflare bindings when you add environment variables.
- `npm run format` and `npm run lint:fix` apply Biome formatting + lint rules; run before every commit.
- `npm run deploy` publishes to Workers; pair it with `curl http://<worker>/health` to verify the SSE endpoint.

## Coding Style & Naming Conventions
TypeScript is the single source of truth. Biome enforces 4-space indentation, 100-character lines, and the rule set in `biome.json`. Prefer `const` declarations, explicit return types on exported functions, and `PascalCase` Durable Objects (`WeatherServer`), with `camelCase` tool names and `kebab-case` worker names (`weather-server`). Schema validation should use Zod, and new tools belong in `src/index.ts` until a submodule warrants its own file.

## Testing Guidelines
There is no standalone test runner yet; treat manual validation as part of every change. Start the worker via `npm run dev`, then exercise `curl http://localhost:8787/health` and `npx -y mcp-remote http://localhost:8787/sse` to confirm MCP compatibility. When adding automated checks, mirror the command naming used elsewhere (e.g., `npm run test:integration`) and document data fixtures in-repo.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commits (e.g., `Disable Cloudflare Access`). Keep subject lines under 72 characters and add a concise body when explaining rationale or rollbacks. Each PR should include: a problem statement, bullet summary of changes, verification notes (commands run, logs, or screenshots of Claude/Playground connections), and links to issues or deployment URLs. Flag any security-impacting modifications (especially anything touching authlessness) so reviewers can perform the appropriate risk checks.

## Security & Deployment Tips
This worker intentionally ships without authentication; never rely on it for sensitive data. Document any configuration knobs you add (`wrangler.toml` vars, Durable Object bindings) so operators can reproduce deployments. Secrets must stay in Wrangler secret storage, not in the repo or commit history, and post-deploy always confirm the `status: "ok"` response before announcing availability.
