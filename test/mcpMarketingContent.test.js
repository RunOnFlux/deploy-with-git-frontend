import test from 'node:test';
import assert from 'node:assert/strict';

import { FAQS, FEATURES } from '../src/content/landingContent.js';
import { MARKETING_PAGES, MARKETING_ROUTES } from '../src/content/pagesContent.js';

test('MCP marketing content is discoverable, complete, and free of em dashes', () => {
  const route = '/mcp-server';
  const page = MARKETING_PAGES[route];
  const mcpFaqs = FAQS.filter(({ q, a }) => /MCP|AI agent/i.test(`${q} ${a}`));
  const mcpFeature = FEATURES.find(({ key }) => key === 'mcp-agents');

  assert.ok(MARKETING_ROUTES.includes(route));
  assert.ok(page);
  assert.ok(page.sections.length >= 5);
  assert.ok(page.faqs.length >= 5);
  assert.ok(page.sections.some(({ heading }) => /Connect/i.test(heading)));
  assert.ok(page.sections.some(({ heading }) => /tools/i.test(heading)));
  assert.ok(page.sections.some(({ heading }) => /security|Authentication/i.test(heading)));
  assert.ok(page.sections.some(({ heading }) => /Troubleshooting/i.test(heading)));
  assert.ok(mcpFaqs.length >= 2);
  assert.ok(mcpFeature);
  assert.equal(JSON.stringify({ page, mcpFaqs, mcpFeature }).includes('—'), false);
});
