/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import type {Channel} from './browser.js';
import {
  ensureBrowserConnected,
  ensureBrowserLaunched,
  isBrowserConnected,
  hasEverConnected,
  onBrowserDisconnected,
  reconnectBrowser,
} from './browser.js';
import {parseArguments} from './cli.js';
import {features} from './features.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import * as advancedTools from './tools/advanced.js';
import * as apiTools from './tools/api.js';
import {ToolCategory} from './tools/categories.js';
import * as consoleTools from './tools/console.js';
import * as coverageTools from './tools/coverage.js';
import * as cryptoTools from './tools/crypto.js';
import * as debuggerTools from './tools/debugger.js';
import * as deobfuscationTools from './tools/deobfuscation.js';
import * as domTools from './tools/dom.js';
import * as globalsTools from './tools/globals.js';
import * as networkTools from './tools/network.js';
import * as pagesTools from './tools/pages.js';
import * as screenshotTools from './tools/screenshot.js';
import * as scriptTools from './tools/script.js';
import * as snapshotTools from './tools/snapshot.js';
import * as scrapingTools from './tools/scraping.js';
import * as protobufTools from './tools/protobuf.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.10.2';
// x-release-please-end

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

// Prevent process crashes from unhandled errors
process.on('unhandledRejection', (reason) => {
  logger(`Unhandled rejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  logger(`Uncaught exception: ${err.message}`);
});

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server',
    version: VERSION,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext;
let browserDisconnected = false;

onBrowserDisconnected(() => {
  logger('Browser disconnected callback triggered');
  browserDisconnected = true;
  if (context) {
    context.dispose();
  }
});

async function getContext(): Promise<McpContext> {
  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  const devtools = args.experimentalDevtools ?? false;

  // If browser was previously connected but now disconnected, try to reconnect
  if (hasEverConnected() && (browserDisconnected || !isBrowserConnected())) {
    logger('Browser not connected, attempting reconnect...');
    const reconnected = await reconnectBrowser();
    if (!reconnected) {
      throw new Error(
        'Browser is disconnected and reconnection failed. Please ensure the browser is running with --remote-debugging-port=9222 and try again.',
      );
    }
    browserDisconnected = false;
    // Force new context creation
    context = await McpContext.from(reconnected, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
    });
    return context;
  }

  const browser =
    args.browserUrl || args.wsEndpoint
      ? await ensureBrowserConnected({
          browserURL: args.browserUrl,
          wsEndpoint: args.wsEndpoint,
          wsHeaders: args.wsHeaders,
          devtools,
        })
      : await ensureBrowserLaunched({
          headless: args.headless,
          executablePath: args.executablePath,
          channel: args.channel as Channel,
          isolated: args.isolated,
          logFile,
          viewport: args.viewport,
          args: extraArgs,
          acceptInsecureCerts: args.acceptInsecureCerts,
          devtools,
        });

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
    });
  }
  return context;
}

const logDisclaimers = () => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    args.categoryNetwork === false
  ) {
    return;
  }
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        const context = await getContext();
        logger(`${tool.name} context: resolved`);
        await context.detectOpenDevToolsWindows();
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        try {
          const content = await response.handle(tool.name, context);
          return {
            content,
          };
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);

          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
            isError: true,
          };
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger(`${tool.name} error: ${errMsg}`);
        // Check if this is a connection error - don't crash, return error
        if (
          errMsg.includes('transport closed') ||
          errMsg.includes('disconnected') ||
          errMsg.includes('Target closed') ||
          errMsg.includes('Session closed') ||
          errMsg.includes('Connection closed') ||
          errMsg.includes('Protocol error')
        ) {
          browserDisconnected = true;
          return {
            content: [
              {
                type: 'text' as const,
                text: `Browser connection lost: ${errMsg}. The connection will auto-reconnect on next tool call.`,
              },
            ],
            isError: true,
          };
        }
        throw err;
      } finally {
        guard.dispose();
      }
    },
  );
}

const tools = [
  ...Object.values(advancedTools),
  ...Object.values(apiTools),
  ...Object.values(consoleTools),
  ...Object.values(coverageTools),
  ...Object.values(cryptoTools),
  ...Object.values(debuggerTools),
  ...Object.values(deobfuscationTools),
  ...Object.values(domTools),
  ...Object.values(globalsTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
  ...Object.values(scrapingTools),
  ...Object.values(protobufTools),
] as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

for (const tool of tools) {
  registerTool(tool);
}

if (features.issues) {
  await loadIssueDescriptions();
}
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();
