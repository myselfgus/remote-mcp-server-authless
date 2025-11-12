-- Migration: Fix mcp_client_connections table schema
-- Adds id column and restructures the table

-- SQLite doesn't support ALTER TABLE to add PRIMARY KEY or modify constraints
-- We need to recreate the table

-- Step 1: Create new table with correct schema
CREATE TABLE IF NOT EXISTS mcp_client_connections_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    transport TEXT NOT NULL,
    status TEXT NOT NULL,
    last_sync INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    server_id TEXT,
    capabilities TEXT,
    tools_count INTEGER DEFAULT 0,
    resources_count INTEGER DEFAULT 0
);

-- Step 2: Copy existing data (if any)
INSERT INTO mcp_client_connections_new (id, name, url, transport, status, last_sync, created_at)
SELECT 
    lower(hex(randomblob(16))) as id,
    name, 
    url, 
    transport, 
    status, 
    last_sync, 
    created_at
FROM mcp_client_connections
WHERE EXISTS (SELECT 1 FROM mcp_client_connections LIMIT 1);

-- Step 3: Drop old table
DROP TABLE IF EXISTS mcp_client_connections;

-- Step 4: Rename new table
ALTER TABLE mcp_client_connections_new RENAME TO mcp_client_connections;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_connections_status ON mcp_client_connections(status);
CREATE INDEX IF NOT EXISTS idx_connections_name ON mcp_client_connections(name);
CREATE INDEX IF NOT EXISTS idx_mcp_client_connections_server_id ON mcp_client_connections(server_id);
