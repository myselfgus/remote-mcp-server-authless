-- Migration: Initial MetaMCP Database Schema
-- Creates 6 tables for MCP server management and client connections

-- Table 1: MCP Servers
CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    wrangler_config TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_name ON mcp_servers(name);
CREATE INDEX IF NOT EXISTS idx_servers_updated_at ON mcp_servers(updated_at);

-- Table 2: MCP Tools
CREATE TABLE IF NOT EXISTS mcp_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    parameters TEXT NOT NULL,
    implementation TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tools_server_id ON mcp_tools(server_id);

-- Table 3: MCP Resources
CREATE TABLE IF NOT EXISTS mcp_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    uri TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    implementation TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resources_server_id ON mcp_resources(server_id);

-- Table 4: MCP Prompts
CREATE TABLE IF NOT EXISTS mcp_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    arguments TEXT NOT NULL,
    template TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompts_server_id ON mcp_prompts(server_id);

-- Table 5: Cleanup Requests
CREATE TABLE IF NOT EXISTS cleanup_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_at INTEGER NOT NULL,
    threshold_days INTEGER NOT NULL,
    servers_found INTEGER NOT NULL,
    servers_deleted INTEGER NOT NULL,
    confirmed BOOLEAN NOT NULL,
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cleanup_requested_at ON cleanup_requests(requested_at);

-- Table 6: MCP Client Connections
CREATE TABLE IF NOT EXISTS mcp_client_connections (
    name TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    transport TEXT NOT NULL,
    status TEXT NOT NULL,
    last_sync INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_status ON mcp_client_connections(status);
