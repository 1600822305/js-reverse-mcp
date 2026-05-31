/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart Web Scraping Tools
 *
 * This module provides intelligent web scraping tools:
 * - Smart content extraction using CSS selectors
 * - Table data extraction
 * - Link extraction
 * - Structured data extraction
 * - Batch element extraction
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

// ==================== Smart Content Extraction ====================

/**
 * Extract content using CSS selectors.
 */
export const smartExtract = defineTool({
  name: 'smart_extract',
  description:
    'Extract content from the page using CSS selectors. Returns text content, attributes, or HTML of matched elements.',
  annotations: {
    title: 'Smart Extract',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    selector: zod
      .string()
      .describe('CSS selector to match elements.'),
    attribute: zod
      .string()
      .optional()
      .describe(
        'Attribute to extract (e.g., "href", "src"). If not specified, extracts text content.',
      ),
    returnHtml: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, returns innerHTML instead of text content.'),
    limit: zod
      .number()
      .int()
      .optional()
      .describe('Maximum number of elements to extract. Omit for all matches.'),
  },
  handler: async (request, response, context) => {
    const {selector, attribute, returnHtml, limit} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const elements = document.querySelectorAll(${JSON.stringify(selector)});
  const results = [];
  const maxItems = ${limit ?? 'elements.length'};
  
  for (let i = 0; i < Math.min(elements.length, maxItems); i++) {
    const el = elements[i];
    let value;
    
    if (${JSON.stringify(attribute)}) {
      value = el.getAttribute(${JSON.stringify(attribute)});
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
    selector: ${JSON.stringify(selector)},
    count: elements.length,
    extracted: results.length,
    results: results
  };
})()
`;

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
 * Extract table data.
 */
export const extractTable = defineTool({
  name: 'extract_table',
  description:
    'Extract data from HTML tables. Returns structured array with headers and rows.',
  annotations: {
    title: 'Extract Table',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    selector: zod
      .string()
      .optional()
      .default('table')
      .describe('CSS selector for the table (default: "table").'),
    tableIndex: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe('Index of the table if multiple tables match (default: 0).'),
    hasHeader: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether the first row is a header (default: true).'),
  },
  handler: async (request, response, context) => {
    const {selector, tableIndex, hasHeader} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const tables = document.querySelectorAll(${JSON.stringify(selector)});
  
  if (tables.length === 0) {
    return { error: 'No tables found matching selector: ${selector}' };
  }
  
  const tableIdx = ${tableIndex};
  if (tableIdx >= tables.length) {
    return { error: 'Table index ' + tableIdx + ' out of range. Found ' + tables.length + ' tables.' };
  }
  
  const table = tables[tableIdx];
  const rows = table.querySelectorAll('tr');
  const result = {
    tableCount: tables.length,
    selectedIndex: tableIdx,
    headers: [],
    data: [],
    rowCount: rows.length
  };
  
  const hasHeaderRow = ${hasHeader};
  let startIdx = 0;
  
  // Extract headers
  if (hasHeaderRow && rows.length > 0) {
    const headerRow = rows[0];
    const headerCells = headerRow.querySelectorAll('th, td');
    headerCells.forEach(cell => {
      result.headers.push(cell.textContent?.trim() || '');
    });
    startIdx = 1;
  }
  
  // Extract data rows
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

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting table: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Extract all links from the page.
 */
export const extractLinks = defineTool({
  name: 'extract_links',
  description:
    'Extract all links (anchor tags) from the page. Optionally filter by pattern.',
  annotations: {
    title: 'Extract Links',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    containerSelector: zod
      .string()
      .optional()
      .describe('CSS selector for the container to search within. Omit for entire page.'),
    urlPattern: zod
      .string()
      .optional()
      .describe('Regex pattern to filter URLs. Only matching URLs will be returned.'),
    includeText: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include link text in results (default: true).'),
  },
  handler: async (request, response, context) => {
    const {containerSelector, urlPattern, includeText} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const container = ${containerSelector ? `document.querySelector(${JSON.stringify(containerSelector)})` : 'document'};
  
  if (!container) {
    return { error: 'Container not found: ${containerSelector}' };
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
    totalLinks: links.length,
    matchedLinks: results.length,
    containerSelector: ${JSON.stringify(containerSelector)} || 'document',
    urlPattern: ${JSON.stringify(urlPattern)} || null,
    links: results
  };
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting links: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Extract structured data using multiple selectors.
 */
export const extractStructured = defineTool({
  name: 'extract_structured',
  description:
    'Extract structured data from the page using a schema of CSS selectors. Perfect for extracting multiple related fields at once.',
  annotations: {
    title: 'Extract Structured Data',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    fields: zod
      .record(zod.string())
      .describe(
        'Object mapping field names to CSS selectors. Example: {"title": "h1", "price": ".price", "description": ".desc"}',
      ),
    containerSelector: zod
      .string()
      .optional()
      .describe('CSS selector for repeating container (for lists). If specified, extracts an array of items.'),
    limit: zod
      .number()
      .int()
      .optional()
      .describe('Maximum number of items to extract when using containerSelector.'),
  },
  handler: async (request, response, context) => {
    const {fields, containerSelector, limit} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const fieldsSchema = ${JSON.stringify(fields)};
  const containerSel = ${JSON.stringify(containerSelector)};
  const maxItems = ${limit ?? 'Infinity'};
  
  function extractFields(root) {
    const result = {};
    
    for (const [fieldName, selector] of Object.entries(fieldsSchema)) {
      const el = root.querySelector(selector);
      if (el) {
        // Try to get text content, fall back to value for inputs
        result[fieldName] = el.textContent?.trim() || el.value || '';
      } else {
        result[fieldName] = null;
      }
    }
    
    return result;
  }
  
  if (containerSel) {
    // Extract array of items
    const containers = document.querySelectorAll(containerSel);
    const results = [];
    
    for (let i = 0; i < Math.min(containers.length, maxItems); i++) {
      results.push(extractFields(containers[i]));
    }
    
    return {
      type: 'array',
      containerSelector: containerSel,
      totalContainers: containers.length,
      extracted: results.length,
      items: results
    };
  } else {
    // Extract single object
    return {
      type: 'object',
      data: extractFields(document)
    };
  }
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting structured data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Extract text blocks from page sections.
 */
export const extractTextBlocks = defineTool({
  name: 'extract_text_blocks',
  description:
    'Extract text content organized by sections (headings and their following content). Useful for article/documentation pages.',
  annotations: {
    title: 'Extract Text Blocks',
    category: ToolCategory.SCRAPING,
    readOnlyHint: true,
  },
  schema: {
    containerSelector: zod
      .string()
      .optional()
      .default('body')
      .describe('CSS selector for the main content container (default: "body").'),
    headingLevel: zod
      .string()
      .optional()
      .default('h1,h2,h3,h4,h5,h6')
      .describe('Heading selectors to use (default: "h1,h2,h3,h4,h5,h6").'),
    includeSubheadings: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Include subheadings within each section (default: true).'),
  },
  handler: async (request, response, context) => {
    const {containerSelector, headingLevel, includeSubheadings} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const container = document.querySelector(${JSON.stringify(containerSelector)});
  
  if (!container) {
    return { error: 'Container not found: ${containerSelector}' };
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
        // Start a new section
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
        // Check for subheadings
        if (${includeSubheadings} && node.matches && node.matches('h1,h2,h3,h4,h5,h6')) {
          currentSection.subheadings.push({
            level: node.tagName.toLowerCase(),
            text: node.textContent?.trim() || ''
          });
        }
        
        // Extract text from paragraphs and other block elements
        if (node.matches && node.matches('p,li,td,th,blockquote,pre,code,span,div')) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            currentSection.content.push(text);
          }
        }
      }
    }
    
    // Recursively process child nodes
    for (const child of node.childNodes) {
      walk(child);
    }
  }
  
  walk(container);
  
  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return {
    containerSelector: ${JSON.stringify(containerSelector)},
    sectionCount: sections.length,
    sections: sections
  };
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error extracting text blocks: ${error instanceof Error ? error.message : String(error)}`,
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
    'Extract form structure and current values. Useful for understanding form submissions.',
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
      .describe('CSS selector for the form (default: "form").'),
    formIndex: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe('Index of the form if multiple forms match (default: 0).'),
  },
  handler: async (request, response, context) => {
    const {formSelector, formIndex} = request.params;
    const page = context.getSelectedPage();

    try {
      const extractCode = `
(function() {
  const forms = document.querySelectorAll(${JSON.stringify(formSelector)});
  
  if (forms.length === 0) {
    return { error: 'No forms found matching selector: ${formSelector}' };
  }
  
  const idx = ${formIndex};
  if (idx >= forms.length) {
    return { error: 'Form index ' + idx + ' out of range. Found ' + forms.length + ' forms.' };
  }
  
  const form = forms[idx];
  const fields = [];
  
  // Get all form elements
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
    
    // Get value based on element type
    if (input.tagName === 'SELECT') {
      const selected = input.querySelector('option:checked');
      field.value = selected ? selected.value : null;
      field.options = Array.from(input.querySelectorAll('option')).map(opt => ({
        value: opt.value,
        text: opt.textContent?.trim(),
        selected: opt.selected
      }));
    } else if (input.type === 'checkbox' || input.type === 'radio') {
      field.checked = input.checked;
      field.value = input.value;
    } else if (input.type === 'hidden') {
      field.value = input.value;
      field.isHidden = true;
    } else {
      field.value = input.value || null;
    }
    
    // Get associated label
    if (input.id) {
      const label = document.querySelector('label[for="' + input.id + '"]');
      if (label) {
        field.label = label.textContent?.trim();
      }
    }
    
    fields.push(field);
  });
  
  return {
    formCount: forms.length,
    selectedIndex: idx,
    action: form.action || null,
    method: form.method || 'get',
    enctype: form.enctype || null,
    fieldCount: fields.length,
    fields: fields
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

/**
 * Click and extract - click an element and extract content after page updates.
 */
export const clickAndExtract = defineTool({
  name: 'click_and_extract',
  description:
    'Click an element and then extract content after the page updates. Useful for loading more content or navigating tabs.',
  annotations: {
    title: 'Click and Extract',
    category: ToolCategory.SCRAPING,
    readOnlyHint: false,
  },
  schema: {
    clickSelector: zod
      .string()
      .describe('CSS selector for the element to click.'),
    extractSelector: zod
      .string()
      .describe('CSS selector for the content to extract after clicking.'),
    waitMs: zod
      .number()
      .int()
      .optional()
      .default(1000)
      .describe('Milliseconds to wait after clicking before extracting (default: 1000).'),
    extractAttribute: zod
      .string()
      .optional()
      .describe('Attribute to extract. If not specified, extracts text content.'),
  },
  handler: async (request, response, context) => {
    const {clickSelector, extractSelector, waitMs, extractAttribute} = request.params;
    const page = context.getSelectedPage();

    try {
      // Click the element
      const clickElement = await page.$(clickSelector);
      if (!clickElement) {
        response.appendResponseLine(`Error: Element not found: ${clickSelector}`);
        return;
      }

      await clickElement.click();

      // Wait for the specified time
      await new Promise(resolve => setTimeout(resolve, waitMs));

      // Extract content
      const extractCode = `
(function() {
  const elements = document.querySelectorAll(${JSON.stringify(extractSelector)});
  const results = [];
  
  elements.forEach((el, i) => {
    let value;
    if (${JSON.stringify(extractAttribute)}) {
      value = el.getAttribute(${JSON.stringify(extractAttribute)});
    } else {
      value = el.textContent?.trim();
    }
    
    if (value) {
      results.push({
        index: i,
        value: value
      });
    }
  });
  
  return {
    clickedSelector: ${JSON.stringify(clickSelector)},
    extractedSelector: ${JSON.stringify(extractSelector)},
    waitMs: ${waitMs},
    count: results.length,
    results: results
  };
})()
`;

      const result = await page.evaluate(extractCode);
      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error) {
      response.appendResponseLine(
        `Error in click and extract: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});