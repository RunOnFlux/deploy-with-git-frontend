import { Check, Gift, Cpu, MemoryStick, HardDrive, Server, Rocket } from 'lucide-react';
import { PLANS } from '../../services/deployService';

const PLAN_COLORS = {
  free:     { bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   text: 'text-slate-400' },
  standard: { bg: 'bg-primary/10',     border: 'border-primary/20',     text: 'text-primary'   },
  pro:      { bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  text: 'text-purple-400' },
  custom:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
};

const PLAN_RESOURCES = {
  free:     [{ icon: Cpu, label: 'CPU',       value: '0.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '1 GB' },
             { icon: HardDrive, label: 'Storage', value: '5 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '1' }],
  standard: [{ icon: Cpu, label: 'CPU',       value: '1.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '4 GB' },
             { icon: HardDrive, label: 'Storage', value: '15 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  pro:      [{ icon: Cpu, label: 'CPU',       value: '2.0 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '6 GB' },
             { icon: HardDrive, label: 'Storage', value: '20 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  custom:   [{ icon: Cpu, label: 'CPU',       value: '0.1 – 15 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '100 MB – 59 GB' },
             { icon: HardDrive, label: 'Storage', value: '1 – 820 GB' },
             { icon: Server, label: 'Instances', value: '1 – 3' }],
};

function PlanCard({ plan, selected, onSelect }) {
  const isSelected = selected?.id === plan.id;
  const isRecommended = plan.badge === 'Popular';
  const resources = PLAN_RESOURCES[plan.id] ?? [];

  return (
    <button
      type="button"
      onClick={() => onSelect(plan)}
      className={`relative flex flex-col gap-4 w-full text-left rounded-2xl border-2 p-6 transition-all duration-300 hover:-translate-y-1 ${
        isSelected
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/15'
          : isRecommended
          ? 'border-primary/30 bg-surface hover:border-primary/60'
          : 'border-border bg-surface hover:border-border-hover'
      }`}
    >
      {/* Most Popular badge */}
      {isRecommended && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-white text-[11px] font-bold px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">
            Most Popular
          </span>
        </div>
      )}

      {/* Selected check */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Price badge */}
      {(() => {
        const c = PLAN_COLORS[plan.id] ?? PLAN_COLORS.free;
        return (
          <div className={`flex flex-col items-center justify-center gap-0.5 px-4 py-3 h-20 ${c.bg} border ${c.border} rounded-xl`}>
            {plan.priceMonthly === null && (
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${c.text} opacity-80`}>Starting at</span>
            )}
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold font-heading ${c.text}`}>
                {plan.priceMonthly === 0 ? '$0' : plan.priceMonthly === null ? '$0.99' : `$${plan.priceMonthly}`}
              </span>
              {plan.priceMonthly === 0 && <span className={`text-sm font-semibold ${c.text} opacity-70`}>*</span>}
              {plan.priceMonthly !== 0 && <span className="text-text-muted text-sm">/mo</span>}
            </div>
          </div>
        );
      })()}

      {/* First month free / Free forever pill */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-1 border border-border rounded-full text-[11px] font-semibold text-text-secondary uppercase tracking-wide w-fit mx-auto">
        <Gift className="w-3 h-3 shrink-0" />
        {plan.priceMonthly === 0 ? 'Free forever*' : 'First month free*'}
      </div>

      {/* Plan header */}
      <div className="text-center pb-4 border-b border-border flex flex-col justify-center min-h-[5rem]">
        <h3 className="font-heading text-xl font-semibold text-text mb-1">{plan.label}</h3>
        <p className="text-sm text-text-muted">{plan.description}</p>
      </div>

      {/* Resource rows */}
      <div className="flex flex-col gap-2.5 flex-1">
        {resources.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="grid gap-2.5 items-center px-3 py-2 bg-surface-hover rounded-xl"
            style={{ gridTemplateColumns: '24px 1fr auto' }}
          >
            <Icon className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-secondary font-medium">{label}</span>
            <span className="text-xs font-semibold text-text text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="pt-1">
        <div className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-colors flex items-center justify-center gap-1.5 ${
          isSelected
            ? 'bg-primary/10 text-primary border border-primary/30'
            : isRecommended
            ? 'bg-primary text-white'
            : 'bg-surface-hover text-text border border-border'
        }`}>
          {isSelected ? (
            <><Check className="w-4 h-4" /> Plan Selected</>
          ) : plan.priceMonthly === 0 ? (
            <><Rocket className="w-4 h-4" /> Start Deploying</>
          ) : (
            <><Gift className="w-4 h-4" /> Start Free Trial</>
          )}
        </div>
      </div>
    </button>
  );
}

const CUSTOM_DEFAULTS = { cpu: 1, ram: 2000, hdd: 10, instances: 1, priceMonthly: null };

export default function Step1Plan({ plan, onChange }) {
  const custom = plan?.id === 'custom' ? plan : null;

  function handleSelect(p) {
    if (p.id === 'custom') {
      onChange({ ...CUSTOM_DEFAULTS, ...p });
    } else {
      onChange(p);
    }
  }

  function handleCustomField(field, value) {
    onChange({ ...PLANS.find((p) => p.id === 'custom'), ...custom, [field]: value });
  }

  return (
    <div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">Select your plan</h2>
      <p className="text-sm text-text-secondary mb-6">
        Choose your plan based on your resource needs.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {PLANS.map((p) => (
          <PlanCard key={p.id} plan={p} selected={plan} onSelect={handleSelect} />
        ))}
      </div>

      {/* Custom plan configurator */}
      {plan?.id === 'custom' && (
        <div className="card p-5 mt-2">
          <h3 className="text-sm font-semibold text-text mb-5">Configure your resources</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* CPU */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">CPU</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0.1" max="15" step="0.1"
                    value={custom?.cpu ?? 1}
                    onChange={(e) => handleCustomField('cpu', Math.min(15, Math.max(0.1, parseFloat(e.target.value) || 0.1)))}
                    className="input-base w-20 text-right text-sm py-1"
                  />
                  <span className="text-xs text-text-muted">Cores</span>
                </div>
              </div>
              <input
                type="range" min="0.1" max="15" step="0.1"
                value={custom?.cpu ?? 1}
                onChange={(e) => handleCustomField('cpu', parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>0.1</span><span>15 Cores</span>
              </div>
            </div>

            {/* RAM */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">RAM</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0.1" max="59" step="0.5"
                    value={custom ? custom.ram / 1000 : 2}
                    onChange={(e) => handleCustomField('ram', Math.round(Math.min(59, Math.max(0.1, parseFloat(e.target.value) || 0.1)) * 1000))}
                    className="input-base w-20 text-right text-sm py-1"
                  />
                  <span className="text-xs text-text-muted">GB</span>
                </div>
              </div>
              <input
                type="range" min="0.1" max="59" step="0.5"
                value={custom ? custom.ram / 1000 : 2}
                onChange={(e) => handleCustomField('ram', Math.round(parseFloat(e.target.value) * 1000))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>100 MB</span><span>59 GB</span>
              </div>
            </div>

            {/* Storage */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Storage</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="1" max="820" step="1"
                    value={custom?.hdd ?? 10}
                    onChange={(e) => handleCustomField('hdd', Math.min(820, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="input-base w-20 text-right text-sm py-1"
                  />
                  <span className="text-xs text-text-muted">GB</span>
                </div>
              </div>
              <input
                type="range" min="1" max="820" step="1"
                value={custom?.hdd ?? 10}
                onChange={(e) => handleCustomField('hdd', parseInt(e.target.value, 10))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>1 GB</span><span>820 GB</span>
              </div>
            </div>

            {/* Instances */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">Instances</span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleCustomField('instances', n)}
                      className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                        (custom?.instances ?? 1) === n
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface-hover text-text-secondary border-border hover:border-primary/50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                Multiple instances improve uptime on the decentralized network.
              </p>
            </div>

          </div>
          <p className="text-xs text-text-muted mt-5 pt-4 border-t border-border">
            Price is calculated at checkout based on selected resources.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-surface-hover rounded-xl border border-border space-y-2">
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="text-text-secondary font-semibold">*</span> Restrictions may apply to prevent abuse.
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="text-text-secondary font-semibold">*</span> The Free plan is automatically renewed
          as long as you have only one Git app running. Additional Git apps are charged $0.99/month each.
        </p>
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5">ℹ️</span>
          The Free plan runs on a single instance. Brief downtime may occur if the hosting node restarts.
          For high-availability apps, Standard or Pro plans are recommended.
        </p>
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5">🔒</span>
          Private GitHub repositories are deployed as Enterprise apps (+$1.33/mo on Free,
          +$2.66/mo on Standard, Pro, and Custom).
        </p>
      </div>
    </div>
  );
}
