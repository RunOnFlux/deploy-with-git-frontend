/**
 * Orbit pricing plans — matches spec resource requirements exactly.
 * Resource values map to Flux app spec (v8) compose fields.
 */

export const ORBIT_PLANS = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Free forever*',
    description: 'Perfect for side projects and learning',
    price: 0,
    priceLabel: '$0*',
    cpu: 0.5,
    ram: 1,      // GB (spec uses ram * 1000 = MB)
    hdd: 5,      // GB
    instances: 1,
    highlight: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'First month free*',
    description: 'For growing projects and small apps',
    price: 2.49,
    priceLabel: '$2.49/mo',
    cpu: 1.5,
    ram: 4,
    hdd: 15,
    instances: 2,
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'First month free*',
    description: 'For active development and production apps',
    price: 3.99,
    priceLabel: '$3.99/mo',
    cpu: 2,
    ram: 6,
    hdd: 20,
    instances: 2,
    highlight: false,
  },
  {
    id: 'custom',
    name: 'Custom',
    tagline: 'First month free*',
    description: 'Configure your own resources and pricing',
    price: null,
    priceLabel: 'Starting at $0.99/mo',
    // Display ranges only; actual values set by user in wizard
    cpuRange: '0.1 - 15 Cores',
    ramRange: '100 MB - 59 GB',
    hddRange: '1 - 820 GB',
    instancesRange: '1 - 3',
    cpu: null,
    ram: null,
    hdd: null,
    instances: null,
    highlight: false,
  },
];

/** Enterprise surcharge (private repos on ArcaneOS nodes) */
export const ENTERPRISE_SURCHARGE = {
  free: 1.33,
  paid: 2.66, // Standard, Pro, Custom
};

/** Billing period multipliers for expire calculation */
export const BILLING_PERIODS = [
  { months: 1,  label: '1 month',   discount: 0,    blocksPerMonth: 88000 },
  { months: 3,  label: '3 months',  discount: 0.03, blocksPerMonth: 88000 },
  { months: 6,  label: '6 months',  discount: 0.06, blocksPerMonth: 88000 },
  { months: 12, label: '12 months', discount: 0.12, blocksPerMonth: 88000 },
];

/** Convert months → expire blocks */
export const monthsToExpire = (months) => months * 88000;

/** Get plan by ID */
export const getPlan = (id) => ORBIT_PLANS.find((p) => p.id === id);

/** Get plan spec values for the app spec compose field */
export const getPlanSpec = (planId) => {
  const plan = getPlan(planId);
  if (!plan || !plan.cpu) return null;
  return {
    cpu: plan.cpu,
    ram: plan.ram * 1000, // convert GB → MB for spec
    hdd: plan.hdd,
    instances: plan.instances,
  };
};
