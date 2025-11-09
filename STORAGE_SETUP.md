# Storage Setup Guide

This guide explains how to set up persistent storage bindings for the Meta-MCP server.

## Current Status

The Meta-MCP server is **ready to deploy** with in-memory storage. The storage bindings are currently commented out in `wrangler.jsonc` and will be activated when you create the corresponding Cloudflare resources.

## Storage Architecture

The server uses the following storage bindings:

| Binding | Type | Purpose |
|---------|------|---------|
| `MCP_KV` | KV Namespace | Primary state storage for MCP server configurations |
| `MCP_DB` | D1 Database | (Future) Relational queries and complex data |
| `MCP_BUCKET` | R2 Bucket | (Future) Generated code and large files |
| `MCP_ANALYTICS` | Analytics Engine | Usage metrics and operational analytics |
| `MCP_VECTORIZE` | Vectorize Index | (Future) Semantic search for servers |

## Setup Instructions

### 1. Create KV Namespace (Required for Persistence)

```bash
# Create KV namespace
npx wrangler kv namespace create MCP_KV

# Output will look like:
# 🌀 Creating namespace with title "meta-mcp-MCP_KV"
# ✨ Success!
# Add the following to your configuration file in your kv_namespaces array:
# { binding = "MCP_KV", id = "abc123..." }
```

Copy the `id` from the output and update `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "MCP_KV",
    "id": "YOUR_KV_NAMESPACE_ID_HERE"
  }
],
```

### 2. Create D1 Database (Optional)

```bash
# Create D1 database
npx wrangler d1 create mcp-database

# Output will include database_id
```

Update `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "MCP_DB",
    "database_name": "mcp-database",
    "database_id": "YOUR_D1_DATABASE_ID_HERE"
  }
],
```

### 3. Create R2 Bucket (Optional)

```bash
# Create R2 bucket
npx wrangler r2 bucket create mcp-storage
```

Update `wrangler.jsonc`:

```jsonc
"r2_buckets": [
  {
    "binding": "MCP_BUCKET",
    "bucket_name": "mcp-storage"
  }
],
```

### 4. Enable Analytics Engine (Optional)

Analytics Engine is automatically available. Just uncomment in `wrangler.jsonc`:

```jsonc
"analytics_engine_datasets": [
  {
    "binding": "MCP_ANALYTICS"
  }
],
```

### 5. Create Vectorize Index (Optional)

```bash
# Create Vectorize index
npx wrangler vectorize create mcp-vectors --dimensions=1536 --metric=cosine
```

Update `wrangler.jsonc`:

```jsonc
"vectorize": [
  {
    "binding": "MCP_VECTORIZE",
    "index_name": "mcp-vectors"
  }
],
```

## Deployment

After configuring the bindings you want:

1. **Uncomment the bindings** in `wrangler.jsonc`
2. **Deploy the worker**:
   ```bash
   npm run deploy
   ```

## State Persistence Behavior

### Without KV (Current Default)

- ✅ Server works normally
- ⚠️ State is stored in-memory only
- ❌ Server configurations are lost on Worker restart
- 📝 Console shows: "MCP_KV not available, using in-memory storage only"

### With KV Enabled

- ✅ Server works with persistent storage
- ✅ State survives Worker restarts
- ✅ Configurations shared across all instances
- 📝 Console shows: "Loaded N servers from KV storage"

## Code Implementation

The persistence system is already implemented in `src/index.ts`:

```typescript
// Automatically loads state at the start of each tool call
await this.loadState();

// Automatically saves state after mutations
await this.saveState();
```

### KV Storage Structure

**Key**: `"mcp:servers"`
**Value**: JSON object with all server configurations

```json
{
  "weather-server": {
    "name": "weather-server",
    "version": "1.0.0",
    "description": "...",
    "tools": [...],
    "resources": [...],
    "prompts": [...],
    "wranglerConfig": {...},
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

## Monitoring

When MCP_ANALYTICS is enabled, the system tracks:

- **Blobs**: `["state_save", "kv"]`
- **Doubles**: `[server_count, timestamp]`
- **Indexes**: `["meta-mcp"]`

Query analytics in the Cloudflare dashboard to monitor storage operations.

## Troubleshooting

### Deploy fails with "namespace 'preview_id' is not valid"

This means the bindings are uncommented but IDs haven't been replaced. Either:
1. Comment out the bindings you haven't created yet
2. Create the resources and add the real IDs

### State not persisting

Check the Worker logs:
```bash
npx wrangler tail
```

Look for:
- ✅ "Loaded N servers from KV storage"
- ✅ "Saved N servers to KV storage"
- ⚠️ "MCP_KV not available"

## Cost Considerations

- **KV**: First 100k reads/day free, then $0.50/million reads
- **D1**: First 5M rows read/day free
- **R2**: First 10GB storage free
- **Analytics Engine**: First 10M events/month free
- **Vectorize**: First 30M queries/month free

For a typical Meta-MCP server usage, you'll likely stay within free tiers.

## Next Steps

1. **Start simple**: Enable only `MCP_KV` for basic persistence
2. **Add more later**: Enable other bindings as needed
3. **Monitor usage**: Check Cloudflare dashboard for metrics

For questions or issues, see the [main README](./README.md).
