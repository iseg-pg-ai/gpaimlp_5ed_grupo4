import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLibrary, presignGet } from '../lambda/intranet/library.mjs';

const entries = [
  { id: 'a', title: 'Lisbon at the Table', file: 'a.pdf', keywords: ['lisboa', 'lisbon', 'food', 'wine'], approved: true },
  { id: 'b', title: 'Hidden Gems of Sintra', file: 'b.pdf', keywords: ['sintra', 'history'], approved: true },
  { id: 'c', title: 'Not reviewed', file: 'c.pdf', keywords: ['lisboa', 'lisbon', 'food'], approved: false },
  { id: 'd', title: 'Porto', file: 'd.pdf', keywords: ['porto'], approved: true },
];

test('only approved proposals that serve the destination are suggested, best first, at most two', () => {
  const result = matchLibrary({ destination: 'Lisbon and Sintra', interests: 'food and wine' }, entries);
  assert.deepEqual(result.map(item => item.id), ['a', 'b']);
  assert.ok(result[0].score > result[1].score);
  assert.ok(result.every(item => item.file && item.reasons.length));
  assert.deepEqual(matchLibrary({ destination: 'Algarve' }, entries), []);
  assert.ok(!matchLibrary({ destination: 'Lisbon' }, entries).some(item => item.id === 'c'));
});

test('presigned URL matches the AWS documented SigV4 example and the lifetime is capped', () => {
  const credentials = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };
  const url = presignGet({ bucket: 'examplebucket', key: 'test.txt', region: 'us-east-1', host: 'examplebucket.s3.amazonaws.com', credentials, expires: 86400, cap: 86400, now: new Date('2013-05-24T00:00:00Z') });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  const capped = presignGet({ bucket: 'b', key: 'x y.pdf', region: 'eu-west-1', credentials, expires: 999999 });
  assert.match(capped, /X-Amz-Expires=21600/);
  assert.match(capped, /\/x%20y\.pdf\?/);
  assert.equal(presignGet({ bucket: 'b', key: 'k', region: 'eu-west-1', credentials: {} }), '');
});
