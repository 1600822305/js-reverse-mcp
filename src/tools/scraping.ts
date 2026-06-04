/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart Web Scraping Tools
 *
 * This module provides intelligent web scraping tools:
 * - `extract`: unified content extraction (elements / structured / links /
 *   table / text blocks) with optional pre-extraction click + wait
 * - `extract_form_data`: form structure and current values
 * - `extract_metadata`: JSON-LD, Open Graph, Twitter cards and meta tags
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Unified Content Extraction ====================

/**
 * Unified content extraction.
 *
 * Replaces smart_extract, extract_structured, extract_links, extract_table,
 * extract_text_blocks and click_and_extract with a single tool whose `type`
 * selects the extraction strategy, plus an optional pre-extraction click/wait.
 */
export const extract = defineTool({
  name: 'extract',
  description:
    'Unified web content extraction. Use `type` to choose a mode: "elements" (CSS selector -> text/attribute/innerHTML of each match), "structured" (a `fields` map of name->selector, optionally repeated over a `containerSelector` to return a list; each field can also pull an attribute or innerHTML), "links" (anchor tags, optional urlPattern filter and container), "table" (headers + rows) or "textBlocks" (page sections grouped by headings). The default type "auto" picks "structured" when `fields` is given, otherwise "elements". Optionally click an element first (clickSelector) and wait (waitForSelector / waitMs) before extracting, e.g. to load more content or switch tabs.',
  annotations: {
    title: 'Extract',
    category: ToolCategory.SCRAPING,
    readOnlyHint: false,
  },
  schema: {
    type: zod
      .enum(['auto', 'elements', 'structured', 'links', 'table', 'textBlocks'])
      .optional()
      .default('auto')
      .describe(
        'Extraction mode. "auto" (default) infers structured when `fields` is provided, otherwise elements.',
      ),
    selector: zod
      .string()
      .optional()
      .describe(
        'CSS selector. Required for type "elements"; for type "table" it selects the table(s) (default "table").',
      ),
    attribute: zod
      .string()
      .optional()
      .describe(
        'For type "elements": attribute to extract (e.g. "href", "src"). If omitted, extracts text content.',
      ),
    returnHtml: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'For type "elements": return innerHTML instead of text content.',
      ),
    limit: zod
      .number()
      .int()
      .optional()
      .describe(
        'Maximum number of items to extract (applies to "elements" and to "structured" lists).',
      ),
    fields: zod
      .record(
        zod.union([
          zod.string(),
          zod.object({
            selector: zod.string(),
            attribute: zod.string().optional(),
            html: zod.boolean().optional(),
          }),
        ]),
      )
      .optional()
      .describe(
        'For type "structured": map of field name -> CSS selector, or -> {selector, attribute?, html?} to pull an attribute or innerHTML instead of text. Example: {"title":"h1","img":{"selector":"img","attribute":"src"}}. Providing this triggers structured mode under "auto".',
      ),
    containerSelector: zod
      .string()
      .optional()
      .describe(
        'For "structured": repeating container selector to return a list of items. For "links": container to search within (default whole page). For "textBlocks": content container (default "body").',
      ),
    urlPattern: zod
      .string()
      .optional()
      .describe('For type "links": regex pattern to filter URLs.'),
    includeText: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'For type "links": include link text in results (default: true).',
      ),
    tableIndex: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'For type "table": index of the table if multiple match (default: 0).',
      ),
    hasHeader: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'For type "table": treat the first row as a header row (default: true).',
      ),
    headingLevel: zod
      .string()
      .optional()
      .default('h1,h2,h3,h4,h5,h6')
      .describe(
        'For type "textBlocks": heading selectors that start a section (default: "h1,h2,h3,h4,h5,h6").',
      ),
    includeSubheadings: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'For type "textBlocks": include subheadings within each section (default: true).',
      ),
    clickSelector: zod
      .string()
      .optional()
      .describe(
        'Optional: click this element before extracting (e.g. a "load more" button or a tab).',
      ),
    waitForSelector: zod
      .string()
      .optional()
      .describe(
        'Optional: after clicking, wait until this selector appears (max 10s) before extracting.',
      ),
    waitMs: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'Optional: milliseconds to wait after clicking before extracting (default: 0).',
      ),
  },
  handler: async (request, response, context) => {
    const {
      type,
      selector,
      attribute,
      returnHtml,
      limit,
      fields,
      containerSelector,
      urlPattern,
      includeText,
      tableIndex,
      hasHeader,
      headingLevel,
      includeSubheadings,
      clickSelector,
      waitForSelector,
      waitMs,
    } = request.params;
    const page = context.getSelectedPage();

    const resolvedType =
      !type || type === 'auto' ? (fields ? 'structured' : 'elements') : type;

    if (resolvedType === 'elements' && !selector) {
      response.appendResponseLine(
        'Error: type "elements" requires a `selector` (or provide `fields` for structured extraction).',
      );
      return;
    }
    if (resolvedType === 'structured' && !fields) {
      response.appendResponseLine(
        'Error: type "structured" requires `fields`.',
      );
      return;
    }

    try {
      if (clickSelector) {
        const clickElement = await page.$(clickSelector);
        if (!clickElement) {
          response.appendResponseLine(
            `Error: Element not found: ${clickSelector}`,
          );
          return;
        }
        await clickElement.click();
        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, {timeout: 10000});
        }
        if (waitMs > 0) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }

      let extractCode: string;
      switch (resolvedType) {
        case 'elements':
          extractCode = `
(function() {
  const elements = document.querySelectorAll(${JSON.stringify(selector)});
  const results = [];
  const maxItems = ${limit ?? 'elements.length'};

  for (let i = 0; i < Math.min(elements.length, maxItems); i++) {
    const el = elements[i];
    let value;

    if (${JSON.stringify(attribute ?? null)}) {
      value = el.getAttribute(${JSON.stringify(attribute ?? '')});
    } else if (${returnHtml}) {
      value = el.innerHTML;
    } else {
      value = el.textContent?.trim();
    }

    if (value !== null && value !== undefined) {
      results.push({
        index: i,
        value: value,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null
      });
    }
  }

  return {
    type: 'elements',
    selector: ${JSON.stringify(selector)},
    count: elements.length,
    extracted: results.length,
    results: results
  };
})()
`;
          break;
        case 'structured':
          extractCode = `
(function() {
  const fieldsSchema = ${JSON.stringify(fields)};
  const containerSel = ${JSON.stringify(containerSelector ?? null)};
  const maxItems = ${limit ?? 'Infinity'};

  function getValue(el, spec) {
    if (spec && typeof spec === 'object') {
      if (spec.attribute) return el.getAttribute(spec.attribute);
      if (spec.html) return el.innerHTML;
    }
    return el.textContent?.trim() || el.value || '';
  }

  function extractFields(root) {
    const result = {};
    for (const [fieldName, spec] of Object.entries(fieldsSchema)) {
      const selector = (spec && typeof spec === 'object') ? spec.selector : spec;
      const el = root.querySelector(selector);
      result[fieldName] = el ? getValue(el, spec) : null;
    }
    return result;
  }

  if (containerSel) {
    const containers = document.querySelectorAll(containerSel);
    const results = [];
    for (let i = 0; i < Math.min(containers.length, maxItems); i++) {
      results.push(extractFields(containers[i]));
    }
    return {
      type: 'structured',
      kind: 'array',
      containerSelector: containerSel,
      totalContainers: containers.length,
      extracted: results.length,
      items: results
    };
  } else {
    return { type: 'structured', kind: 'object', data: extractFields(document) };
  }
})()
`;
          break;
        case 'links':
          extractCode = `
(function() {
  const container = ${containerSelector ? `document.querySelector(${JSON.stringify(containerSelector)})` : 'document'};

  if (!container) {
    return { error: 'Container not found: ' + ${JSON.stringify(containerSelector ?? null)} };
  }

  const links = container.querySelectorAll('a[href]');
  const results = [];
  const urlRegex = ${urlPattern ? `new RegExp(${JSON.stringify(urlPattern)})` : 'null'};

  links.forEach((link, index) => {
    const href = link.href;

    if (urlRegex && !urlRegex.test(href)) {
      return;
    }

    const item = {
      index: index,
      href: href,
      relativeHref: link.getAttribute('href')
    };

    if (${includeText}) {
      item.text = link.textContent?.trim() || '';
    }

    if (link.target) item.target = link.target;
    if (link.title) item.title = link.title;

    results.push(item);
  });

  return {
    type: 'links',
    totalLinks: links.length,
    matchedLinks: results.length,
    containerSelector: ${JSON.stringify(containerSelector ?? null)} || 'document',
    urlPattern: ${JSON.stringify(urlPattern ?? null)} || null,
    links: results
  };
})()
`;
          break;
        case 'table':
          extractCode = `
(function() {
  const tableSelector = ${JSON.stringify(selector ?? 'table')};
  const tables = document.querySelectorAll(tableSelector);

  if (tables.length === 0) {
    return { error: 'No tables found matching selector: ' + tableSelector };
  }

  const tableIdx = ${tableIndex};
  if (tableIdx >= tables.length) {
    return { error: 'Table index ' + tableIdx + ' out of range. Found ' + tables.length + ' tables.' };
  }

  const table = tables[tableIdx];
  const rows = table.querySelectorAll('tr');
  const result = {
    type: 'table',
    tableCount: tables.length,
    selectedIndex: tableIdx,
    headers: [],
    data: [],
    rowCount: rows.length
  };

  const hasHeaderRow = ${hasHeader};
  let startIdx = 0;

  if (hasHeaderRow && rows.length > 0) {
    const headerRow = rows[0];
    const headerCells = headerRow.querySelectorAll('th, td');
    headerCells.forEach(cell => {
      result.headers.push(cell.textContent?.trim() || '');
    });
    startIdx = 1;
  }

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.querySelectorAll('td, th');
    const rowData = [];

    cells.forEach(cell => {
      rowData.push(cell.textContent?.trim() || '');
    });

    if (rowData.length > 0) {
      result.data.push(rowData);
    }
  }

  return result;
})()
`;
          break;
        case 'textBlocks':
          extractCode = `
(function() {
  const containerSelector = ${JSON.stringify(containerSelector ?? 'body')};
  const container = document.querySelector(containerSelector);

  if (!container) {
    return { error: 'Container not found: ' + containerSelector };
  }

  const headingSelector = ${JSON.stringify(headingLevel)};
  const sections = [];
  let currentSection = null;

  function isHeading(el) {
    return el.matches && el.matches(headingSelector);
  }

  function walk(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (isHeading(node)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: node.textContent?.trim() || '',
          headingLevel: node.tagName.toLowerCase(),
          content: [],
          subheadings: []
        };
      } else if (currentSection) {
        if (${includeSubheadings} && node.matches && node.matches('h1,h2,h3,h4,h5,h6')) {
          currentSection.subheadings.push({
            level: node.tagName.toLowerCase(),
            text: node.textContent?.trim() || ''
          });
        }

        if (node.matches && node.matches('p,li,td,th,blockquote,pre,code,span,div')) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            currentSection.content.push(text);
          }
        }
      }
    }

    for (const child of node.childNodes) {
      walk(child);
    }
  }

  walk(container);

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    type: 'textBlocks',
    containerSelector: containerSelector,
    sectionCount: sections.length,
    sections: sections
  };
})()
`;
          break;
        default:
          response.appendResponseLine(
            `Error: unknown extraction type "${resolvedType}".`,
          );
          return;
      }

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Extract form data.
 */
export const extractFormData = defineTool({
  name: 'extract_form_data',
  description:
    'Extract form structure and current values, including hidden fields. By default returns all matching forms; pass formIndex to inspect a single form. Password values are masked unless maskPasswords is set to false.',
  annotations: {
    title: 'Extract Form Data',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    formSelector: zod
      .string()
      .optional()
      .default('form')
      .describe('CSS selector for the form(s) (default: "form").'),
    formIndex: zod
      .number()
      .int()
      .optional()
      .describe(
        'Index of a single form to inspect when multiple forms match. When omitted, all matching forms are returned.',
      ),
    maskPasswords: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Mask password field values as "********" instead of returning the plaintext value (default: true).',
      ),
  },
  handler: async (request, response, context) => {
    const {formSelector, formIndex, maskPasswords} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const forms = document.querySelectorAll(${JSON.stringify(formSelector)});

  if (forms.length === 0) {
    return { error: 'No forms found matching selector: ' + ${JSON.stringify(formSelector)} };
  }

  const requestedIndex = ${formIndex === undefined ? 'null' : formIndex};
  if (requestedIndex !== null && requestedIndex >= forms.length) {
    return { error: 'Form index ' + requestedIndex + ' out of range. Found ' + forms.length + ' forms.' };
  }

  const maskPasswords = ${maskPasswords};

  function extractForm(form, formIdx) {
    const fields = [];
    const inputs = form.querySelectorAll('input, select, textarea, button');

    inputs.forEach((input, i) => {
      const field = {
        index: i,
        tagName: input.tagName.toLowerCase(),
        type: input.type || null,
        name: input.name || null,
        id: input.id || null,
        value: null,
        required: input.required || false,
        disabled: input.disabled || false
      };

      if (input.tagName === 'SELECT') {
        const selected = input.querySelector('option:checked');
        field.value = selected ? selected.value : null;
        field.options = Array.from(input.querySelectorAll('option')).map(opt => ({
          value: opt.value,
          text: opt.textContent ? opt.textContent.trim() : null,
          selected: opt.selected
        }));
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        field.checked = input.checked;
        field.value = input.value;
      } else if (input.type === 'password') {
        field.value = maskPasswords ? '********' : input.value;
      } else if (input.type === 'hidden') {
        field.value = input.value;
        field.isHidden = true;
      } else {
        field.value = input.value || null;
      }

      if (input.id) {
        const label = document.querySelector('label[for="' + input.id + '"]');
        if (label) {
          field.label = label.textContent ? label.textContent.trim() : null;
        }
      }

      fields.push(field);
    });

    return {
      index: formIdx,
      id: form.id || null,
      name: form.name || null,
      action: form.action || null,
      method: (form.method || 'get').toUpperCase(),
      enctype: form.enctype || null,
      fieldCount: fields.length,
      fields: fields
    };
  }

  const selected = requestedIndex !== null
    ? [{form: forms[requestedIndex], idx: requestedIndex}]
    : Array.from(forms).map((form, idx) => ({form, idx}));

  return {
    formCount: forms.length,
    forms: selected.map(({form, idx}) => extractForm(form, idx))
  };
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting form data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Export JSON-LD and other structured data.
 */
export const extractMetadata = defineTool({
  name: 'extract_metadata',
  description:
    'Extract page metadata including JSON-LD, Open Graph, Twitter cards, and standard meta tags.',
  annotations: {
    title: 'Extract Metadata',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const result = {
    title: document.title,
    description: null,
    keywords: null,
    canonical: null,
    jsonLd: [],
    openGraph: {},
    twitter: {},
    meta: {}
  };
  
  // Extract standard meta tags
  const metaTags = document.querySelectorAll('meta');
  metaTags.forEach(meta => {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    
    if (!name || !content) return;
    
    if (name === 'description') {
      result.description = content;
    } else if (name === 'keywords') {
      result.keywords = content;
    } else if (name.startsWith('og:')) {
      result.openGraph[name.substring(3)] = content;
    } else if (name.startsWith('twitter:')) {
      result.twitter[name.substring(8)] = content;
    } else {
      result.meta[name] = content;
    }
  });
  
  // Extract canonical URL
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    result.canonical = canonical.getAttribute('href');
  }
  
  // Extract JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      result.jsonLd.push(data);
    } catch (e) {
      result.jsonLd.push({ error: 'Failed to parse JSON-LD', raw: script.textContent });
    }
  });
  
  return result;
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
