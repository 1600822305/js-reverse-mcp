/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Code Coverage Analysis Tools
 *
 * This module provides tools for analyzing JavaScript and CSS code coverage:
 * - Start/stop coverage collection
 * - Generate coverage reports
 * - Identify unused code
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== JavaScript Coverage ====================

/**
 * Start collecting JavaScript code coverage.
 */
export const startJSCoverage = defineTool({
  name: 'start_js_coverage',
  description:
    'Starts collecting JavaScript code coverage data. This tracks which parts of JavaScript code are executed.',
  annotations: {
    title: 'Start JS Coverage',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    resetOnNavigation: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to reset coverage on navigation (default: false). Set to true to track coverage per page.',
      ),
    reportAnonymousScripts: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to report anonymous scripts (default: true). Set to false to only track named scripts.',
      ),
    includeRawScriptCoverage: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to include raw V8 coverage data (default: false). Useful for detailed analysis.',
      ),
  },
  handler: async (request, response, context) => {
    const {
      resetOnNavigation,
      reportAnonymousScripts,
      includeRawScriptCoverage,
    } = request.params;

    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const client = debugger_.getClient();
    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      // Enable Profiler domain for coverage
      await client.send('Profiler.enable');

      // Start precise coverage
      await client.send('Profiler.startPreciseCoverage', {
        callCount: true,
        detailed: true,
      });

      // Enable Debugger for script tracking
      await client.send('Debugger.enable');

      // Store coverage state in page context
      const page = context.getSelectedPage();
      await page.evaluate(
        `
        window.__mcp_coverage__ = window.__mcp_coverage__ || {};
        window.__mcp_coverage__.js = {
          active: true,
          startTime: new Date().toISOString(),
          resetOnNavigation: ${resetOnNavigation},
          reportAnonymousScripts: ${reportAnonymousScripts},
          includeRawScriptCoverage: ${includeRawScriptCoverage}
        };
      `,
      );

      response.appendResponseLine('✅ JavaScript coverage collection started!');
      response.appendResponseLine(
        `- Reset on navigation: ${resetOnNavigation}`,
      );
      response.appendResponseLine(
        `- Report anonymous scripts: ${reportAnonymousScripts}`,
      );
      response.appendResponseLine(
        `- Include raw coverage: ${includeRawScriptCoverage}`,
      );
      response.appendResponseLine('');
      response.appendResponseLine(
        'Use stop_js_coverage to stop collection and get the report.',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Stop collecting JavaScript coverage and generate report.
 */
export const stopJSCoverage = defineTool({
  name: 'stop_js_coverage',
  description:
    'Stops collecting JavaScript code coverage and generates a detailed report showing which code was executed and which was not.',
  annotations: {
    title: 'Stop JS Coverage',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    minCoverage: zod
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe(
        'Only show scripts with coverage below this percentage (0-100). Useful for finding unused code.',
      ),
    sortBy: zod
      .enum(['coverage', 'size', 'url'])
      .optional()
      .default('coverage')
      .describe('How to sort the results (default: coverage).'),
  },
  handler: async (request, response, context) => {
    const {minCoverage, sortBy} = request.params;

    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const client = debugger_.getClient();
    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      // Get coverage data
      const coverageData = await client.send('Profiler.takePreciseCoverage');

      // Stop coverage
      await client.send('Profiler.stopPreciseCoverage');
      await client.send('Profiler.disable');

      const page = context.getSelectedPage();
      const coverageState = (await page.evaluate(
        `window.__mcp_coverage__ && window.__mcp_coverage__.js`,
      )) as {
        active: boolean;
        startTime: string;
        resetOnNavigation: boolean;
        reportAnonymousScripts: boolean;
        includeRawScriptCoverage: boolean;
      } | null;

      if (!coverageState) {
        response.appendResponseLine(
          'Coverage was not started. Use start_js_coverage first.',
        );
        return;
      }

      // Process coverage data
      interface CoverageEntry {
        url: string;
        scriptId: string;
        totalBytes: number;
        usedBytes: number;
        coverage: number;
        functions: Array<{
          functionName: string;
          ranges: Array<{
            startOffset: number;
            endOffset: number;
            count: number;
          }>;
        }>;
      }

      const coverageResults: CoverageEntry[] = [];

      for (const entry of coverageData.result) {
        const script = debugger_.getScriptById(entry.scriptId);
        if (!script) continue;

        // Skip if anonymous and not reporting them
        if (
          !coverageState.reportAnonymousScripts &&
          (!script.url || script.url.startsWith('debugger://'))
        ) {
          continue;
        }

        let totalBytes = 0;
        let usedBytes = 0;

        for (const func of entry.functions) {
          for (const range of func.ranges) {
            const rangeSize = range.endOffset - range.startOffset;
            totalBytes += rangeSize;
            if (range.count > 0) {
              usedBytes += rangeSize;
            }
          }
        }

        const coverage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        // Filter by minimum coverage if specified
        if (minCoverage !== undefined && coverage >= minCoverage) {
          continue;
        }

        coverageResults.push({
          url: script.url || `<anonymous ${entry.scriptId}>`,
          scriptId: entry.scriptId,
          totalBytes,
          usedBytes,
          coverage,
          functions: entry.functions,
        });
      }

      // Sort results
      coverageResults.sort((a, b) => {
        switch (sortBy) {
          case 'coverage':
            return a.coverage - b.coverage;
          case 'size':
            return b.totalBytes - a.totalBytes;
          case 'url':
            return a.url.localeCompare(b.url);
          default:
            return 0;
        }
      });

      // Clear coverage state
      await page.evaluate(`delete window.__mcp_coverage__.js`);

      // Generate report
      response.appendResponseLine('📊 JavaScript Coverage Report\n');
      response.appendResponseLine(
        `Total scripts analyzed: ${coverageResults.length}`,
      );

      if (coverageResults.length === 0) {
        response.appendResponseLine(
          '\nNo scripts found matching the criteria.',
        );
        return;
      }

      const totalSize = coverageResults.reduce(
        (sum, r) => sum + r.totalBytes,
        0,
      );
      const totalUsed = coverageResults.reduce(
        (sum, r) => sum + r.usedBytes,
        0,
      );
      const overallCoverage = totalSize > 0 ? (totalUsed / totalSize) * 100 : 0;

      response.appendResponseLine(
        `Overall coverage: ${overallCoverage.toFixed(2)}% (${totalUsed}/${totalSize} bytes)`,
      );
      response.appendResponseLine('');

      // Show top results (limit to 20)
      const displayLimit = 20;
      const displayResults = coverageResults.slice(0, displayLimit);

      for (const result of displayResults) {
        const coverageBar = generateCoverageBar(result.coverage);
        response.appendResponseLine(
          `${coverageBar} ${result.coverage.toFixed(1)}% - ${result.url}`,
        );
        response.appendResponseLine(
          `  Used: ${result.usedBytes}/${result.totalBytes} bytes, Functions: ${result.functions.length}`,
        );

        // Show unused functions
        const unusedFunctions = result.functions.filter(f =>
          f.ranges.every(r => r.count === 0),
        );
        if (unusedFunctions.length > 0 && unusedFunctions.length <= 5) {
          response.appendResponseLine(
            `  Unused functions: ${unusedFunctions.map(f => f.functionName || '<anonymous>').join(', ')}`,
          );
        } else if (unusedFunctions.length > 5) {
          response.appendResponseLine(
            `  Unused functions: ${unusedFunctions.length} total`,
          );
        }
        response.appendResponseLine('');
      }

      if (coverageResults.length > displayLimit) {
        response.appendResponseLine(
          `... and ${coverageResults.length - displayLimit} more scripts`,
        );
      }

      response.appendResponseLine('\n💡 Tips:');
      response.appendResponseLine(
        '- Use minCoverage parameter to filter scripts with low coverage',
      );
      response.appendResponseLine(
        '- Scripts with 0% coverage are completely unused and can be removed',
      );
      response.appendResponseLine(
        '- Use get_script_source to examine specific scripts',
      );
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});


/**
 * Get combined coverage report.
 */
export const getCoverageReport = defineTool({
  name: 'get_coverage_report',
  description:
    'Gets the current coverage status for both JavaScript and CSS, showing what coverage collection is active.',
  annotations: {
    title: 'Get Coverage Report',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    try {
      const page = context.getSelectedPage();

      const coverageState = (await page.evaluate(
        `window.__mcp_coverage__ || {}`,
      )) as {
        js?: {active: boolean; startTime: string};
      };

      response.appendResponseLine('📊 JavaScript Coverage Status\n');

      if (coverageState.js?.active) {
        response.appendResponseLine(
          `✅ JavaScript coverage: Active (started ${coverageState.js.startTime})`,
        );
      } else {
        response.appendResponseLine(
          '❌ JavaScript coverage: Inactive (use start_js_coverage)',
        );
      }

      response.appendResponseLine('');
      response.appendResponseLine('Use stop_js_coverage to generate report.');
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// ==================== Helper Functions ====================

/**
 * Generate a visual coverage bar.
 */
function generateCoverageBar(percentage: number): string {
  const barLength = 20;
  const filled = Math.round((percentage / 100) * barLength);
  const empty = barLength - filled;

  let color = '🔴'; // Red for low coverage
  if (percentage >= 80) {
    color = '🟢'; // Green for high coverage
  } else if (percentage >= 50) {
    color = '🟡'; // Yellow for medium coverage
  }

  return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
