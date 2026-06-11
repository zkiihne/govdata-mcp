#!/usr/bin/env node
import { createServer } from "./registry.js";
import { startStdio } from "./transport/stdio.js";

async function main(): Promise<void> {
  // Transport is swappable: stdio here for local dev; Streamable HTTP for
  // remote access lives in api/mcp.ts (Vercel). Both share createServer().
  const server = createServer();
  await startStdio(server);
}

main().catch((err) => {
  console.error("govdata-mcp fatal:", err);
  process.exit(1);
});
