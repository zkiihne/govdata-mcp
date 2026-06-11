#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DISCOVERY_TOOL_NAME,
  DISCOVERY_TOOL_DESCRIPTION,
  runDiscovery,
} from "./tools/discovery.js";
import { noaaConnector } from "./connectors/noaa.js";
import { route } from "./router.js";
import type { RawQuery } from "./connectors/types.js";
import { startStdio } from "./transport/stdio.js";

const QUERY_TOOL_NAME = "query_data_source";

const server = new Server(
  { name: "govdata-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: DISCOVERY_TOOL_NAME,
      description: DISCOVERY_TOOL_DESCRIPTION,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: QUERY_TOOL_NAME,
      description: `Query a government/public-data source by id (call ${DISCOVERY_TOOL_NAME} first to list ids). RAW PASSTHROUGH: your query is forwarded to the upstream API verbatim and the response is returned unmodified. Premium sources return a 402 until billing is enabled.\n\n--- NOAA (id: "noaa") ---\n${noaaConnector.describe().description}`,
      inputSchema: {
        type: "object",
        properties: {
          connectorId: {
            type: "string",
            description: 'Data source id from discovery, e.g. "noaa".',
          },
          path: {
            type: "string",
            description:
              'Upstream path appended to the source base URL, e.g. "/points/39.7456,-104.9903".',
          },
          params: {
            type: "object",
            description: "Optional querystring params, forwarded verbatim.",
            additionalProperties: { type: "string" },
          },
          method: {
            type: "string",
            description: "HTTP method, defaults to GET.",
          },
          body: {
            description: "Optional request body for non-GET methods, forwarded verbatim.",
          },
        },
        required: ["connectorId", "path"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === DISCOVERY_TOOL_NAME) {
    return {
      content: [{ type: "text", text: JSON.stringify(runDiscovery(), null, 2) }],
    };
  }

  if (name === QUERY_TOOL_NAME) {
    const a = (args ?? {}) as Record<string, unknown>;
    const connectorId = a["connectorId"];
    const path = a["path"];
    if (typeof connectorId !== "string" || typeof path !== "string") {
      return {
        isError: true,
        content: [
          { type: "text", text: "connectorId and path are required strings." },
        ],
      };
    }
    const rawQuery: RawQuery = {
      path,
      params: a["params"] as Record<string, string> | undefined,
      method: a["method"] as string | undefined,
      body: a["body"],
    };
    const result = await route(connectorId, rawQuery);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

async function main(): Promise<void> {
  // Transport is swappable: stdio now, HTTP/Vercel later (src/transport/).
  await startStdio(server);
}

main().catch((err) => {
  console.error("govdata-mcp fatal:", err);
  process.exit(1);
});
