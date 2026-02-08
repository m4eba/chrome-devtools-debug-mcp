import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import createDebug from 'debug';
import { DebugSession } from './DebugSession.js';
import { allTools, error as toolError } from './tools/index.js';

const debug = createDebug('cdp:server');

export async function main(): Promise<void> {
  const session = new DebugSession();

  const server = new Server(
    {
      name: 'chrome-devtools-debug-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    debug('Tool call: %s %o', name, args);

    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      return toolError(`Unknown tool: ${name}`);
    }

    try {
      // Parse and validate args
      const parsed = tool.inputSchema.safeParse(args ?? {});
      if (!parsed.success) {
        return toolError(`Invalid arguments: ${parsed.error.message}`);
      }

      const result = await tool.handler(session, parsed.data);
      debug('Tool result: %s %o', name, result);
      return result;
    } catch (e) {
      debug('Tool error: %s %s', name, e);
      return toolError(e instanceof Error ? e.message : String(e));
    }
  });

  // Setup event forwarding as notifications
  session.on('paused', (data) => {
    debug('Event: paused %o', data);
  });

  session.on('resumed', () => {
    debug('Event: resumed');
  });

  session.on('scriptParsed', (data) => {
    debug('Event: scriptParsed %s', data.url || data.scriptId);
  });

  session.on('consoleMessage', (data) => {
    debug('Event: console.%s %s', data.type, data.text);
  });

  session.on('requestPaused', (data) => {
    debug('Event: requestPaused %s', data.url);
  });

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  debug('Server started');
}
