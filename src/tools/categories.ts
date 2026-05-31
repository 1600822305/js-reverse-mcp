/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ToolCategory {
  NAVIGATION = 'navigation',
  NETWORK = 'network',
  DEBUGGING = 'debugging',
  REVERSE_ENGINEERING = 'reverse_engineering',
  SCRAPING = 'scraping',
}

export const labels = {
  [ToolCategory.NAVIGATION]: 'Navigation automation',
  [ToolCategory.NETWORK]: 'Network',
  [ToolCategory.DEBUGGING]: 'Debugging',
  [ToolCategory.REVERSE_ENGINEERING]: 'JS Reverse Engineering',
  [ToolCategory.SCRAPING]: 'Web Scraping',
};
