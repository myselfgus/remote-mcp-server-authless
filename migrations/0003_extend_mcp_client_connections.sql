-- Migration: Extend mcp_client_connections table
-- Adds server_id column for tracking MCP client connections

ALTER TABLE mcp_client_connections ADD COLUMN server_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mcp_client_connections_server_id ON mcp_client_connections(server_id);
