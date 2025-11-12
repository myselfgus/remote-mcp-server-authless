-- Migration: Add Platform Integration Tables
-- Extends the schema with tables for worker deployments, connections, and container executions

-- Extend mcp_servers table with new columns
ALTER TABLE mcp_servers ADD COLUMN container_id TEXT;
ALTER TABLE mcp_servers ADD COLUMN worker_name TEXT;
ALTER TABLE mcp_servers ADD COLUMN status TEXT CHECK(status IN ('creating', 'building', 'deploying', 'active', 'failed', 'stopped')) DEFAULT 'creating';
ALTER TABLE mcp_servers ADD COLUMN metadata TEXT;

-- Create index for status
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);

-- Extend mcp_tools table
ALTER TABLE mcp_tools ADD COLUMN handler_code TEXT;

-- Table: worker_deployments
-- Tracks deployments managed by worker-publisher
CREATE TABLE IF NOT EXISTS worker_deployments (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL UNIQUE,
  server_id TEXT,
  namespace TEXT NOT NULL,
  script_content TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'deploying', 'active', 'failed')) NOT NULL DEFAULT 'pending',
  deployed_at INTEGER,
  deployment_url TEXT,
  metadata TEXT,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_deployments_status ON worker_deployments(status);
CREATE INDEX IF NOT EXISTS idx_worker_deployments_namespace ON worker_deployments(namespace);

-- Table: mcp_connections
-- Tracks active MCP client connections (extends mcp_client_connections)
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  connection_url TEXT NOT NULL,
  status TEXT CHECK(status IN ('connecting', 'connected', 'disconnected', 'error')) NOT NULL DEFAULT 'connecting',
  created_at INTEGER NOT NULL,
  last_ping INTEGER,
  error_message TEXT,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_server ON mcp_connections(server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_status ON mcp_connections(status);

-- Table: container_executions
-- Tracks SDK build executions in containers
CREATE TABLE IF NOT EXISTS container_executions (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT CHECK(status IN ('queued', 'running', 'completed', 'failed')) NOT NULL DEFAULT 'queued',
  output TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_container_executions_server ON container_executions(server_id);
CREATE INDEX IF NOT EXISTS idx_container_executions_status ON container_executions(status);
CREATE INDEX IF NOT EXISTS idx_container_executions_container ON container_executions(container_id);
