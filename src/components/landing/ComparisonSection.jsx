import { motion } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/outline';

const PROVIDERS = [
  {
    name: 'Orbit',
    badge: 'Best Value',
    plan: 'Developer',
    price: '$2.49/mo',
    cpu: '1.5 Cores',
    ram: '4 GB',
    builds: 'Unlimited',
    highlight: true,
  },
  {
    name: 'Vercel',
    plan: 'Pro',
    price: '$20/mo',
    cpu: 'Shared',
    ram: 'Shared',
    builds: 'Limited',
    highlight: false,
  },
  {
    name: 'Netlify',
    plan: 'Pro',
    price: '$19/mo',
    cpu: 'Shared',
    ram: 'Shared',
    builds: 'Credit-based',
    highlight: false,
  },
  {
    name: 'Render',
    plan: 'Standard',
    price: '$25/mo',
    cpu: '1 Core',
    ram: '2 GB',
    builds: '500 min/mo',
    highlight: false,
  },
  {
    name: 'Railway',
    plan: 'Hobby',
    price: '$5/mo',
    cpu: 'Usage-based',
    ram: 'Usage-based',
    builds: 'Usage-based',
    highlight: false,
  },
];

const COLS = [
  { key: 'plan',   label: 'Plan'   },
  { key: 'price',  label: 'Price'  },
  { key: 'cpu',    label: 'CPU'    },
  { key: 'ram',    label: 'RAM'    },
  { key: 'builds', label: 'Builds' },
];

function ValueCell({ value, highlight }) {
  const isShared    = value === 'Shared';
  const isUsage     = value === 'Usage-based';
  const isLimited   = value === 'Limited' || value === 'Credit-based' || value?.includes('min/mo');
  const isUnlimited = value === 'Unlimited';

  const cls = isUnlimited
    ? 'text-accent font-semibold'
    : isShared || isUsage || isLimited
      ? 'text-text-muted'
      : highlight
        ? 'text-text font-medium'
        : 'text-text-secondary';

  return <span className={cls}>{value}</span>;
}

export default function ComparisonSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">
            Why Orbit
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text">
            How Git deployment compares
          </h2>
          <p className="text-text-secondary mt-4 max-w-xl mx-auto">
            Dedicated resources, unlimited builds, a fraction of the price.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="overflow-x-auto rounded-2xl border border-border"
        >
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-5 py-4 text-text-secondary font-medium w-[22%]">Provider</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-4 py-4 text-center text-text-secondary font-medium text-xs uppercase tracking-wide">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p, i) => (
                <tr
                  key={p.name}
                  className={`border-b border-border/50 last:border-0 transition-colors ${
                    p.highlight
                      ? 'bg-primary/5'
                      : i % 2 === 0 ? 'bg-background' : 'bg-surface/30'
                  }`}
                >
                  {/* Provider name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {p.highlight && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                      <span className={p.highlight ? 'text-primary font-semibold' : 'text-text-secondary'}>
                        {p.name}
                      </span>
                      {p.badge && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                          {p.badge}
                        </span>
                      )}
                    </div>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-4 py-3.5 text-center text-sm">
                      <ValueCell value={p[c.key]} highlight={p.highlight} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <p className="text-center text-text-secondary text-sm mt-5">
          Prices as of 2025. Orbit Developer plan: dedicated resources, decentralised infrastructure.
        </p>
      </div>
    </section>
  );
}
