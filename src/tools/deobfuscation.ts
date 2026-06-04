/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Code Deobfuscation Tools
 *
 * AST-based JavaScript deobfuscation powered by Babel. Unlike regex/string
 * based approaches, all transforms operate on the parsed AST so they are
 * scope-aware and safe (string literals and unrelated identifiers are never
 * touched by mistake). Provides, in a single pass:
 * - Scope-safe variable renaming (obfuscated names -> readable names)
 * - Constant folding (e.g. 2*60*60 -> 7200, 'a'+'b' -> 'ab')
 * - Dead code & unreachable code elimination (if(false){}, code after return)
 * - String/number normalization (\x41\x42 -> AB, 0x10 -> 16, obj['p'] -> obj.p)
 */

import _generate from '@babel/generator';
import {parse} from '@babel/parser';
import _traverse from '@babel/traverse';
import type {NodePath} from '@babel/traverse';
import * as t from '@babel/types';

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// @babel/traverse and @babel/generator are CommonJS modules whose real callable
// lives on `.default` when imported from an ESM context.
const traverse =
  (_traverse as unknown as {default?: typeof _traverse}).default ?? _traverse;
const generate =
  (_generate as unknown as {default?: typeof _generate}).default ?? _generate;

const TERMINATORS = new Set([
  'ReturnStatement',
  'ThrowStatement',
  'BreakStatement',
  'ContinueStatement',
]);

const PURE_HEX_NAME = /^_0x[0-9a-f]+$/i;
const PREFIXED_NAME = /^_0x\w+$/i;
const SHORT_NAME = /^[a-z]{1,2}$/;
const PRESERVED_SHORT = /^[ijk]$/;
const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const deobfuscate = defineTool({
  name: 'deobfuscate',
  description:
    'AST-based JavaScript deobfuscation (powered by Babel). Parses the code into an AST and applies scope-safe transforms: variable renaming, constant folding, dead/unreachable code elimination, and string/number normalization. Far more reliable than regex-based approaches because it understands scopes and never rewrites string contents or unrelated identifiers. Provide a scriptId (from list_scripts) or a raw code snippet. Use beautify_script if you only want pretty-printing.',
  annotations: {
    title: 'Deobfuscate (AST)',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    scriptId: zod
      .string()
      .optional()
      .describe('The script ID to deobfuscate (from list_scripts).'),
    code: zod
      .string()
      .optional()
      .describe(
        'JavaScript code to deobfuscate. Use this for a snippet instead of a full script.',
      ),
    renameVariables: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Rename obfuscated identifiers (e.g. _0x3f2a) to readable names using scope-safe renaming (default: true).',
      ),
    foldConstants: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Evaluate constant expressions like 2*60*60 or "a"+"b" to their literal value (default: true).',
      ),
    removeDeadCode: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Remove dead branches (if(false){}) and unreachable code after return/throw/break/continue (default: true).',
      ),
    simplifyStrings: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Normalize literals: decode \\xNN/\\uNNNN escapes, convert hex/octal/binary numbers to decimal, and rewrite obj["prop"] to obj.prop (default: true).',
      ),
    aggressive: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Also rename _0x-prefixed non-hex names and short 1-2 char identifiers. May reduce readability of intentional short names (default: false).',
      ),
    preserveShortNames: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'When aggressive renaming is on, keep common loop counters i/j/k unchanged (default: true).',
      ),
    maxOutputLength: zod
      .number()
      .optional()
      .default(20000)
      .describe(
        'Maximum number of characters of deobfuscated code to return. Set to 0 for unlimited (default: 20000).',
      ),
  },
  handler: async (request, response, context) => {
    const {
      scriptId,
      code,
      renameVariables,
      foldConstants,
      removeDeadCode,
      simplifyStrings,
      aggressive,
      preserveShortNames,
      maxOutputLength,
    } = request.params;

    if (!scriptId && !code) {
      response.appendResponseLine(
        'Error: Either scriptId or code must be provided.',
      );
      return;
    }

    let sourceCode = code;

    if (scriptId) {
      const debugger_ = context.debuggerContext;
      if (!debugger_.isEnabled()) {
        response.appendResponseLine(
          'Debugger is not enabled. Please select a page first.',
        );
        return;
      }
      try {
        sourceCode = await debugger_.getScriptSource(scriptId);
      } catch (error) {
        response.appendResponseLine(
          `Error getting script source: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }
    }

    if (!sourceCode) {
      response.appendResponseLine('No source code to deobfuscate.');
      return;
    }

    let ast;
    try {
      ast = parse(sourceCode, {
        sourceType: 'unambiguous',
        errorRecovery: true,
        plugins: [],
      });
    } catch (error) {
      response.appendResponseLine(
        `Error: failed to parse code as JavaScript: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.appendResponseLine(
        'Tip: if this is a code fragment, wrap it so it is syntactically complete, or use beautify_script for plain formatting.',
      );
      return;
    }

    const stats = {
      strings: 0,
      numbers: 0,
      members: 0,
      folded: 0,
      deadBranches: 0,
      unreachable: 0,
      renamed: 0,
    };

    if (simplifyStrings) {
      traverse(ast, {
        StringLiteral(path) {
          const extra = path.node.extra;
          if (
            extra &&
            typeof extra.raw === 'string' &&
            (extra.raw.includes('\\x') || extra.raw.includes('\\u'))
          ) {
            path.node.extra = undefined;
            stats.strings++;
          }
        },
        NumericLiteral(path) {
          const extra = path.node.extra;
          if (
            extra &&
            typeof extra.raw === 'string' &&
            /^0[xob]/i.test(extra.raw)
          ) {
            path.node.extra = undefined;
            stats.numbers++;
          }
        },
        MemberExpression(path) {
          const node = path.node;
          if (
            node.computed &&
            t.isStringLiteral(node.property) &&
            VALID_IDENTIFIER.test(node.property.value)
          ) {
            node.property = t.identifier(node.property.value);
            node.computed = false;
            stats.members++;
          }
        },
      });
    }

    if (foldConstants) {
      const foldVisitor = (
        path: NodePath<
          | t.BinaryExpression
          | t.UnaryExpression
          | t.LogicalExpression
          | t.ConditionalExpression
        >,
      ) => {
        const evaluated = path.evaluate();
        if (!evaluated.confident) {
          return;
        }
        const value = evaluated.value;
        if (
          value === null ||
          ['string', 'number', 'boolean'].includes(typeof value)
        ) {
          try {
            path.replaceWith(t.valueToNode(value));
            stats.folded++;
            path.skip();
          } catch {
            // valueToNode can fail for unusual values; leave the node as-is.
          }
        }
      };
      traverse(ast, {
        BinaryExpression: foldVisitor,
        UnaryExpression: foldVisitor,
        LogicalExpression: foldVisitor,
        ConditionalExpression: foldVisitor,
      });
    }

    if (removeDeadCode) {
      traverse(ast, {
        IfStatement(path) {
          const evaluated = path.get('test').evaluate();
          if (!evaluated.confident) {
            return;
          }
          if (evaluated.value) {
            const consequent = path.node.consequent;
            path.replaceWithMultiple(
              t.isBlockStatement(consequent) ? consequent.body : [consequent],
            );
          } else if (path.node.alternate) {
            const alternate = path.node.alternate;
            path.replaceWithMultiple(
              t.isBlockStatement(alternate) ? alternate.body : [alternate],
            );
          } else {
            path.remove();
          }
          stats.deadBranches++;
        },
      });

      const dropUnreachable = (
        path: NodePath<t.BlockStatement | t.Program>,
      ) => {
        const body = path.get('body');
        let cut = -1;
        for (let i = 0; i < body.length; i++) {
          if (TERMINATORS.has(body[i].node.type)) {
            cut = i;
            break;
          }
        }
        if (cut < 0) {
          return;
        }
        for (let i = body.length - 1; i > cut; i--) {
          // Keep hoisted function declarations (reachable regardless of order).
          if (body[i].isFunctionDeclaration()) {
            continue;
          }
          body[i].remove();
          stats.unreachable++;
        }
      };
      traverse(ast, {
        BlockStatement: dropUnreachable,
        Program: dropUnreachable,
      });
    }

    if (renameVariables) {
      const isObfuscated = (name: string): boolean => {
        if (PURE_HEX_NAME.test(name)) {
          return true;
        }
        if (aggressive) {
          if (PREFIXED_NAME.test(name)) {
            return true;
          }
          if (SHORT_NAME.test(name)) {
            return !(preserveShortNames && PRESERVED_SHORT.test(name));
          }
        }
        return false;
      };

      let counter = 0;
      const seenScopes = new Set<number>();
      traverse(ast, {
        Scopable(path) {
          const scope = path.scope;
          if (seenScopes.has(scope.uid)) {
            return;
          }
          seenScopes.add(scope.uid);
          for (const name of Object.keys(scope.bindings)) {
            if (!isObfuscated(name)) {
              continue;
            }
            const binding = scope.bindings[name];
            const bindingPath = binding.path;
            let base = 'v';
            const init =
              bindingPath.node && t.isVariableDeclarator(bindingPath.node)
                ? bindingPath.node.init
                : null;
            if (
              bindingPath.isFunctionDeclaration() ||
              (init &&
                (t.isFunctionExpression(init) ||
                  t.isArrowFunctionExpression(init)))
            ) {
              base = 'fn';
            } else if (binding.kind === 'param') {
              base = 'arg';
            } else if (init) {
              if (t.isStringLiteral(init)) {
                base = 'str';
              } else if (t.isNumericLiteral(init)) {
                base = 'num';
              } else if (t.isObjectExpression(init)) {
                base = 'obj';
              } else if (t.isArrayExpression(init)) {
                base = 'arr';
              } else if (t.isCallExpression(init)) {
                base = 'ret';
              }
            }
            let candidate = `${base}${++counter}`;
            while (scope.hasBinding(candidate)) {
              candidate = `${base}${++counter}`;
            }
            scope.rename(name, candidate);
            stats.renamed++;
          }
        },
      });
    }

    let output: string;
    try {
      output = generate(ast, {
        comments: true,
        jsescOption: {minimal: true},
      }).code;
    } catch (error) {
      response.appendResponseLine(
        `Error: failed to generate code: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    response.appendResponseLine('🔧 Deobfuscation complete (AST transforms)');
    response.appendResponseLine('');
    response.appendResponseLine('Changes applied:');
    response.appendResponseLine(`  - Variables renamed: ${stats.renamed}`);
    response.appendResponseLine(
      `  - Constant expressions folded: ${stats.folded}`,
    );
    response.appendResponseLine(
      `  - Dead branches removed: ${stats.deadBranches}`,
    );
    response.appendResponseLine(
      `  - Unreachable statements removed: ${stats.unreachable}`,
    );
    response.appendResponseLine(`  - String escapes decoded: ${stats.strings}`);
    response.appendResponseLine(`  - Numbers normalized: ${stats.numbers}`);
    response.appendResponseLine(
      `  - Member accesses simplified: ${stats.members}`,
    );
    response.appendResponseLine('');

    const limit = maxOutputLength && maxOutputLength > 0 ? maxOutputLength : 0;
    const truncated = limit > 0 && output.length > limit;
    const shown = truncated ? output.slice(0, limit) : output;

    response.appendResponseLine('```javascript');
    response.appendResponseLine(shown);
    response.appendResponseLine('```');
    if (truncated) {
      response.appendResponseLine('');
      response.appendResponseLine(
        `(Output truncated to ${limit} of ${output.length} characters. Increase maxOutputLength or pass a smaller scope.)`,
      );
    }

    response.appendResponseLine('');
    response.appendResponseLine('💡 Tips:');
    response.appendResponseLine(
      '- Run again with aggressive=true to also rename short/_0x-prefixed names.',
    );
    response.appendResponseLine(
      '- String-array obfuscation that resolves values at runtime needs hook_function or a breakpoint to capture the decoded strings.',
    );
  },
});
