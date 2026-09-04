import test from 'node:test';
import assert from 'node:assert/strict';

import { ADDITIONAL_APP_PLAN, PLANS, supportsCustomDomain } from '../src/services/deployService.js';

test('additional app plan keeps free-tier resources at $0.99 per month', () => {
  const freePlan = PLANS.find((plan) => plan.id === 'free');

  assert.deepEqual(
    {
      id: ADDITIONAL_APP_PLAN.id,
      cpu: ADDITIONAL_APP_PLAN.cpu,
      ram: ADDITIONAL_APP_PLAN.ram,
      hdd: ADDITIONAL_APP_PLAN.hdd,
      instances: ADDITIONAL_APP_PLAN.instances,
    },
    {
      id: freePlan.id,
      cpu: freePlan.cpu,
      ram: freePlan.ram,
      hdd: freePlan.hdd,
      instances: freePlan.instances,
    },
  );
  assert.equal(ADDITIONAL_APP_PLAN.label, freePlan.label);
  assert.equal(ADDITIONAL_APP_PLAN.description, freePlan.description);
  assert.equal(ADDITIONAL_APP_PLAN.priceMonthly, 0.99);
  assert.equal(ADDITIONAL_APP_PLAN.isAdditionalApp, true);
});

test('only the genuinely free plan excludes custom domains', () => {
  assert.equal(supportsCustomDomain(PLANS.find((plan) => plan.id === 'free')), false);
  assert.equal(supportsCustomDomain(ADDITIONAL_APP_PLAN), true);
  assert.equal(supportsCustomDomain(PLANS.find((plan) => plan.id === 'standard')), true);
  assert.equal(supportsCustomDomain(PLANS.find((plan) => plan.id === 'custom')), true);
});
