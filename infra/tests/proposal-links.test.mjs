import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalShareUrl, embedProposalLink, proposalPayload } from '../../frontend/intranet/proposal-links.js';
const portal = 'https://d3804amye1jw31.cloudfront.net/';
const link = `${portal}share/test-token`;
test('only real share routes on the configured HTTPS portal are accepted', () => {
  assert.equal(proposalShareUrl(link, portal), link);
  assert.equal(proposalShareUrl(`${portal}api/shares/test-token/document`, portal), `${portal}api/shares/test-token/document`);
  for (const bad of [portal+'catalog', 'https://evil.example/share/test-token', 'http://d3804amye1jw31.cloudfront.net/share/test-token', link+'?redirect=evil', 'javascript:alert(1)']) assert.equal(proposalShareUrl(bad, portal), '');
});
test('inserts URL into edited messages, replacing placeholders without duplication', () => {
  assert.equal(embedProposalLink('Custom intro\nYour proposal: [link da proposta]', link), `Custom intro\nYour proposal: ${link}`);
  const message = embedProposalLink('Custom intro', link);
  assert.equal(embedProposalLink(message, link), message);
  assert.equal(embedProposalLink(message, link+'2', link), `Custom intro\n\nYour proposal: ${link}2`);
});
test('payload preserves the full URL and refuses truncation with recommendation text', () => {
  assert.ok(proposalPayload('Hello',link).endsWith(link));
  assert.throws(()=>proposalPayload('x'.repeat(970),link,' recommended service'),/máximo 1000/);
});
