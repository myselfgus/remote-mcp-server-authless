-- Migration: Make config column nullable since we use wrangler_config instead
-- The config column is legacy and not being used anymore

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
CREATE TABLE mcp_servers_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    version TEXT NOT NULL DEFAULT '1.0.0',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    config TEXT,  -- Now nullable
    wrangler_config TEXT,
    worker_name TEXT,
    container_id TEXT,
    metadata TEXT
);

-- Copy data from old table
INSERT INTO mcp_servers_new
SELECT id, name, version, description, status, created_at, updated_at, config, wrangler_config, worker_name, container_id, metadata
FROM mcp_servers;

-- Drop old table
DROP TABLE mcp_servers;

-- Rename new table
ALTER TABLE mcp_servers_new RENAME TO mcp_servers;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_worker_name ON mcp_servers(worker_name);
