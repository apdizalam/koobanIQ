import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

// TIQ-25: behind Render's proxy (TRUST_PROXY=1) the server must see each visitor's
// own address, or every visitor would share one per-address limit.
test('TRUST_PROXY makes the server trust that many proxies; 0 trusts none', () => {
  const saved = env.trustProxy;
  try {
    env.trustProxy = 1;
    assert.equal(createApp().get('trust proxy'), 1);
    env.trustProxy = 0;
    assert.equal(createApp().get('trust proxy'), false);
  } finally {
    env.trustProxy = saved;
  }
});
