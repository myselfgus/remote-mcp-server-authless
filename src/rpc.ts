import { WorkerEntrypoint } from 'cloudflare:workers';
import { nanoid } from 'nanoid';

interface Env {
	DB: D1Database;
	KV: KVNamespace;
	STORAGE: R2Bucket;
	DISPATCHER: any;
	WORKER_PUBLISHER: any;
	CONTAINER_MANAGER: any;
	MCP_CLIENT: any;
}

export class MetaMCPRPC extends WorkerEntrypoint<Env> {
	/**
	 * Create and deploy a new MCP server
	 * @param name Server name
	 * @param description Server description
	 * @param tools Array of tool definitions
	 */
	async createServer(
		name: string,
		description: string,
		tools: Array<{
			name: string;
			description: string;
			inputSchema: any;
			handler: string; // TypeScript code for the handler
		}>
	) {
		try {
			const serverId = nanoid();
			const workerName = `mcp-${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

			// 1. Create record in mcp_servers
			await this.env.DB.prepare(`
				INSERT INTO mcp_servers (
					id, name, version, description, status, created_at, updated_at, wrangler_config
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				serverId,
				name,
				'1.0.0',
				description,
				'creating',
				Date.now(),
				Date.now(),
				JSON.stringify({
					name: workerName,
					compatibility_date: '2025-03-10',
					compatibility_flags: ['nodejs_compat']
				})
			).run();

			// 2. Store tools in database
			for (const tool of tools) {
				await this.env.DB.prepare(`
					INSERT INTO mcp_tools (server_id, name, description, parameters, implementation, created_at, handler_code)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				`).bind(
					serverId,
					tool.name,
					tool.description,
					JSON.stringify(tool.inputSchema),
					'', // Legacy field
					Date.now(),
					tool.handler
				).run();
			}

			// 3. Create SDK environment in container
			await this.env.DB.prepare(`
				UPDATE mcp_servers SET status = 'building' WHERE id = ?
			`).bind(serverId).run();

			const containerResult = await this.env.CONTAINER_MANAGER.createSDKEnvironment(
				serverId,
				['@modelcontextprotocol/sdk', 'agents', 'zod']
			);

			if (!containerResult.success) {
				throw new Error('Failed to create SDK environment: ' + containerResult.error);
			}

			// 4. Generate MCP server code
			const code = this.generateMCPServerCode(name, description, tools);

			// 5. Build in container
			const buildResult = await this.env.CONTAINER_MANAGER.buildMCPServer(
				containerResult.containerId,
				serverId,
				code
			);

			if (!buildResult.success) {
				throw new Error('Build failed: ' + buildResult.error);
			}

			// 6. Deploy via worker-publisher
			await this.env.DB.prepare(`
				UPDATE mcp_servers SET status = 'deploying', container_id = ? WHERE id = ?
			`).bind(containerResult.containerId, serverId).run();

			const deployResult = await this.env.WORKER_PUBLISHER.deployFromMetaMCP(
				serverId,
				workerName,
				buildResult.scriptContent
			);

			if (!deployResult.success) {
				throw new Error('Deployment failed: ' + deployResult.error);
			}

			// 7. Update final status
			await this.env.DB.prepare(`
				UPDATE mcp_servers SET status = 'active', worker_name = ?, updated_at = ? WHERE id = ?
			`).bind(workerName, Date.now(), serverId).run();

			return {
				success: true,
				serverId,
				workerName,
				deploymentUrl: deployResult.deploymentUrl,
				tools: tools.map(t => t.name)
			};
		} catch (error) {
			console.error('Failed to create server:', error);

			// Update status to failed
			await this.env.DB.prepare(`
				UPDATE mcp_servers SET status = 'failed', metadata = ? WHERE name = ?
			`).bind(
				JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
				name
			).run();

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * List all MCP servers
	 */
	async listServers(limit: number = 100, offset: number = 0) {
		try {
			const result = await this.env.DB.prepare(`
				SELECT
					s.*,
					COUNT(DISTINCT t.id) as tools_count,
					COUNT(DISTINCT r.id) as resources_count,
					COUNT(DISTINCT p.id) as prompts_count
				FROM mcp_servers s
				LEFT JOIN mcp_tools t ON s.id = t.server_id
				LEFT JOIN mcp_resources r ON s.id = r.server_id
				LEFT JOIN mcp_prompts p ON s.id = p.server_id
				GROUP BY s.id
				ORDER BY s.created_at DESC
				LIMIT ? OFFSET ?
			`).bind(limit, offset).all();

			return {
				success: true,
				servers: result.results || []
			};
		} catch (error) {
			console.error('Failed to list servers:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get server status
	 */
	async getServerStatus(serverId: string) {
		try {
			const server = await this.env.DB.prepare(`
				SELECT * FROM mcp_servers WHERE id = ?
			`).bind(serverId).first();

			if (!server) {
				return {
					success: false,
					error: 'Server not found'
				};
			}

			const tools = await this.env.DB.prepare(`
				SELECT * FROM mcp_tools WHERE server_id = ?
			`).bind(serverId).all();

			return {
				success: true,
				server,
				tools: tools.results || []
			};
		} catch (error) {
			console.error('Failed to get server status:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Connect to a deployed MCP server
	 */
	async connectToServer(serverId: string) {
		try {
			const server = await this.env.DB.prepare(`
				SELECT * FROM mcp_servers WHERE id = ?
			`).bind(serverId).first() as any;

			if (!server) {
				return {
					success: false,
					error: 'Server not found'
				};
			}

			if (server.status !== 'active') {
				return {
					success: false,
					error: `Server is ${server.status}, not active`
				};
			}

			// Use MCP_CLIENT to connect
			const serverUrl = `https://${server.worker_name}.meta-mcp.workers.dev`;

			const connectionResult = await this.env.MCP_CLIENT.connectToServer(
				serverId,
				serverUrl,
				server.name
			);

			if (!connectionResult.success) {
				throw new Error('Failed to connect: ' + connectionResult.error);
			}

			return {
				success: true,
				connectionId: connectionResult.connectionId,
				tools: connectionResult.tools,
				serverUrl
			};
		} catch (error) {
			console.error('Failed to connect to server:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Stop and optionally delete a server
	 */
	async stopServer(serverId: string, deleteFromNamespace: boolean = false) {
		try {
			const server = await this.env.DB.prepare(`
				SELECT * FROM mcp_servers WHERE id = ?
			`).bind(serverId).first() as any;

			if (!server) {
				return {
					success: false,
					error: 'Server not found'
				};
			}

			// Update status
			await this.env.DB.prepare(`
				UPDATE mcp_servers SET status = 'stopped', updated_at = ? WHERE id = ?
			`).bind(Date.now(), serverId).run();

			// Optionally delete deployment
			if (deleteFromNamespace && server.worker_name) {
				const deployment = await this.env.DB.prepare(`
					SELECT * FROM worker_deployments WHERE worker_name = ?
				`).bind(server.worker_name).first() as any;

				if (deployment) {
					await this.env.WORKER_PUBLISHER.deleteDeployment(deployment.id);
				}
			}

			return {
				success: true,
				serverId
			};
		} catch (error) {
			console.error('Failed to stop server:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Generate MCP server code from tool definitions
	 */
	private generateMCPServerCode(
		name: string,
		description: string,
		tools: Array<{
			name: string;
			description: string;
			inputSchema: any;
			handler: string;
		}>
	): { [filename: string]: string } {
		const toolsCode = tools.map(tool => `
			{
				name: "${tool.name}",
				description: "${tool.description}",
				inputSchema: ${JSON.stringify(tool.inputSchema, null, 2)},
				handler: ${tool.handler}
			}
		`).join(',\n');

		const indexTs = `
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const tools = [
	${toolsCode}
];

export class ${name.replace(/[^a-zA-Z0-9]/g, '')}Server extends McpAgent {
	name = "${name}";
	version = "1.0.0";
	description = "${description}";

	constructor() {
		super();
		// Register all tools
		for (const tool of tools) {
			this.server.tool(tool.name, tool.inputSchema, tool.handler);
		}
	}
}

export default {
	async fetch(request: Request, env: any, ctx: ExecutionContext) {
		const server = new ${name.replace(/[^a-zA-Z0-9]/g, '')}Server();
		return await server.fetch(request, env, ctx);
	}
};
`;

		const packageJson = `{
  "name": "${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}",
  "version": "1.0.0",
  "description": "${description}",
  "main": "index.ts",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "agents": "latest",
    "zod": "^3.22.0"
  }
}`;

		const wranglerJsonc = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}",
  "main": "index.ts",
  "compatibility_date": "2025-03-10",
  "compatibility_flags": ["nodejs_compat"]
}`;

		return {
			'index.ts': indexTs,
			'package.json': packageJson,
			'wrangler.jsonc': wranglerJsonc
		};
	}
}
