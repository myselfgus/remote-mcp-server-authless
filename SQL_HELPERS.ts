// SQL HELPERS - Para adicionar na classe MetaMCP após initializeDatabase()

// SQL helper methods for CRUD operations
private async getServerFromDB(serverId: string): Promise<MCPServerConfig | null> {
	const serverRows = this.sql<DatabaseSchema["mcp_servers"]>`
		SELECT * FROM mcp_servers WHERE id = ${serverId}
	`;

	if (serverRows.length === 0) return null;

	const server = serverRows[0];

	const tools = this.sql<DatabaseSchema["mcp_tools"]>`
		SELECT * FROM mcp_tools WHERE server_id = ${serverId}
	`.map((t) => ({
		name: t.name,
		description: t.description,
		parameters: JSON.parse(t.parameters),
		implementation: t.implementation,
	}));

	const resources = this.sql<DatabaseSchema["mcp_resources"]>`
		SELECT * FROM mcp_resources WHERE server_id = ${serverId}
	`.map((r) => ({
		uri: r.uri,
		name: r.name,
		description: r.description,
		mimeType: r.mime_type,
		implementation: r.implementation,
	}));

	const prompts = this.sql<DatabaseSchema["mcp_prompts"]>`
		SELECT * FROM mcp_prompts WHERE server_id = ${serverId}
	`.map((p) => ({
		name: p.name,
		description: p.description,
		arguments: JSON.parse(p.arguments),
		template: p.template,
	}));

	return {
		name: server.name,
		version: server.version,
		description: server.description,
		tools,
		resources,
		prompts,
		wranglerConfig: JSON.parse(server.wrangler_config),
		createdAt: server.created_at,
		updatedAt: server.updated_at,
	};
}

private async saveServerToDB(serverId: string, config: MCPServerConfig): Promise<void> {
	// Insert or update server
	this.sql`
		INSERT INTO mcp_servers (id, name, version, description, created_at, updated_at, wrangler_config)
		VALUES (${serverId}, ${config.name}, ${config.version}, ${config.description},
				${config.createdAt}, ${config.updatedAt}, ${JSON.stringify(config.wranglerConfig)})
		ON CONFLICT(id) DO UPDATE SET
			version = ${config.version},
			description = ${config.description},
			updated_at = ${config.updatedAt},
			wrangler_config = ${JSON.stringify(config.wranglerConfig)}
	`;

	// Delete existing tools/resources/prompts for this server
	this.sql`DELETE FROM mcp_tools WHERE server_id = ${serverId}`;
	this.sql`DELETE FROM mcp_resources WHERE server_id = ${serverId}`;
	this.sql`DELETE FROM mcp_prompts WHERE server_id = ${serverId}`;

	// Insert tools
	for (const tool of config.tools) {
		this.sql`
			INSERT INTO mcp_tools (server_id, name, description, parameters, implementation, created_at)
			VALUES (${serverId}, ${tool.name}, ${tool.description}, ${JSON.stringify(tool.parameters)},
					${tool.implementation}, ${Date.now()})
		`;
	}

	// Insert resources
	for (const resource of config.resources) {
		this.sql`
			INSERT INTO mcp_resources (server_id, uri, name, description, mime_type, implementation, created_at)
			VALUES (${serverId}, ${resource.uri}, ${resource.name}, ${resource.description},
					${resource.mimeType}, ${resource.implementation}, ${Date.now()})
		`;
	}

	// Insert prompts
	for (const prompt of config.prompts) {
		this.sql`
			INSERT INTO mcp_prompts (server_id, name, description, arguments, template, created_at)
			VALUES (${serverId}, ${prompt.name}, ${prompt.description}, ${JSON.stringify(prompt.arguments)},
					${prompt.template}, ${Date.now()})
		`;
	}
}

private async deleteServerFromDB(serverId: string): Promise<boolean> {
	const result = this.sql`DELETE FROM mcp_servers WHERE id = ${serverId}`;
	return result.length > 0;
}

private async listServersFromDB(): Promise<MCPServerConfig[]> {
	const serverRows = this.sql<DatabaseSchema["mcp_servers"]>`SELECT * FROM mcp_servers`;

	const servers: MCPServerConfig[] = [];
	for (const server of serverRows) {
		const config = await this.getServerFromDB(server.id);
		if (config) servers.push(config);
	}

	return servers;
}

// State update helpers
private async updateServerStats(): Promise<void> {
	const servers = await this.listServersFromDB();

	let totalTools = 0;
	let totalResources = 0;
	let totalPrompts = 0;

	for (const server of servers) {
		totalTools += server.tools.length;
		totalResources += server.resources.length;
		totalPrompts += server.prompts.length;
	}

	const newState: Partial<MetaMCPState> = {
		totalServers: servers.length,
		totalTools,
		totalResources,
		totalPrompts,
		lastHealthCheck: Date.now(),
		databaseHealth: "healthy",
	};

	this.setState({ ...this.state, ...newState });
}

private async notifyServerCreated(name: string): Promise<void> {
	await this.updateServerStats();
	this.setState({
		...this.state,
		lastServerCreated: { name, timestamp: Date.now() },
	});
}

private async notifyServerUpdated(name: string): Promise<void> {
	await this.updateServerStats();
	this.setState({
		...this.state,
		lastServerUpdated: { name, timestamp: Date.now() },
	});
}

private async notifyServerDeleted(name: string): Promise<void> {
	await this.updateServerStats();
	this.setState({
		...this.state,
		lastServerDeleted: { name, timestamp: Date.now() },
	});
}

// Observability helpers
private emitObservabilityEvent(type: string, payload: Record<string, unknown> = {}): void {
	const event = {
		timestamp: new Date().toISOString(),
		type,
		...payload,
	};
	console.info(JSON.stringify(event));
}

private async trackToolUsage(toolName: string, duration: number, success: boolean): Promise<void> {
	this.emitObservabilityEvent("tool:usage", {
		tool: toolName,
		duration_ms: duration,
		success,
		timestamp: Date.now(),
	});
}

private async withObservability<T>(operation: string, fn: () => Promise<T>): Promise<T> {
	const startTime = Date.now();
	let success = false;

	try {
		const result = await fn();
		success = true;
		return result;
	} catch (error) {
		this.emitObservabilityEvent("error", {
			operation,
			error: error instanceof Error ? error.message : String(error),
			timestamp: Date.now(),
		});
		throw error;
	} finally {
		const duration = Date.now() - startTime;
		await this.trackToolUsage(operation, duration, success);
	}
}
