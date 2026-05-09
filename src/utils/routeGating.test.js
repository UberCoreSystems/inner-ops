import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isExemptPath, EXEMPT_PATHS } from './routeGating.js';

describe('isExemptPath', () => {
  it('exempts /auth and child routes', () => {
    assert.equal(isExemptPath('/auth'), true);
    assert.equal(isExemptPath('/auth/'), true);
    assert.equal(isExemptPath('/auth/reset'), true);
  });

  it('exempts /onboarding and child routes', () => {
    assert.equal(isExemptPath('/onboarding'), true);
    assert.equal(isExemptPath('/onboarding/step/3'), true);
  });

  it('exempts /oura/callback', () => {
    assert.equal(isExemptPath('/oura/callback'), true);
    assert.equal(isExemptPath('/oura/callback?code=abc'), true);
  });

  it('does NOT exempt main app routes', () => {
    assert.equal(isExemptPath('/'), false);
    assert.equal(isExemptPath('/dashboard'), false);
    assert.equal(isExemptPath('/journal'), false);
    assert.equal(isExemptPath('/ledger'), false);
    assert.equal(isExemptPath('/profile'), false);
    assert.equal(isExemptPath('/settings'), false);
    assert.equal(isExemptPath('/synthesis'), false);
    assert.equal(isExemptPath('/relapse'), false);
    assert.equal(isExemptPath('/hardlessons'), false);
  });

  it('fails safe (non-exempt) on bad input', () => {
    assert.equal(isExemptPath(null), false);
    assert.equal(isExemptPath(undefined), false);
    assert.equal(isExemptPath(''), false);
    assert.equal(isExemptPath(42), false);
    assert.equal(isExemptPath({}), false);
  });

  it('exposes EXEMPT_PATHS as a frozen public list', () => {
    assert.ok(Array.isArray(EXEMPT_PATHS));
    assert.ok(Object.isFrozen(EXEMPT_PATHS));
    assert.ok(EXEMPT_PATHS.includes('/auth'));
    assert.ok(EXEMPT_PATHS.includes('/onboarding'));
    assert.ok(EXEMPT_PATHS.includes('/oura/callback'));
  });
});
