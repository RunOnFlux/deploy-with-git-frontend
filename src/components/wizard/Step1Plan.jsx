import { Check, Gift, Cpu, MemoryStick, HardDrive, Server, Rocket, LayoutGrid, AlertTriangle, Info, Lock } from 'lucide-react';
import { PLANS, normalizeCustomPlan } from '../../services/deployService';
import { useApps } from '../../hooks/useApps';

const PLAN_COLORS = {
  free: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' },
  standard: { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary' },
  pro: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  custom: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
};

const PLAN_RESOURCES = {
  free: [{ icon: Cpu, label: 'CPU', value: '0.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '1 GB' },
             { icon: HardDrive, label: 'Storage', value: '5 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '1' }],
  standard: [{ icon: Cpu, label: 'CPU', value: '1.5 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '4 GB' },
             { icon: HardDrive, label: 'Storage', value: '15 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  pro: [{ icon: Cpu, label: 'CPU', value: '2.0 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '6 GB' },
             { icon: HardDrive, label: 'Storage', value: '20 GB SSD/NVMe' },
             { icon: Server, label: 'Instances', value: '2' }],
  custom: [{ icon: Cpu, label: 'CPU', value: '0.1 – 15 Cores' },
             { icon: MemoryStick, label: 'RAM', value: '100 MB – 59 GB' },
             { icon: HardDrive, label: 'Storage', value: '1 – 820 GB' },
             { icon: Server, label: 'Instances', value: '1 – 3' }],
};

function PlanCard({ plan, selected, disabled = false, disabledReason = '', onSelect }) {
  const isSelected = !disabled && selected?.id === plan.id;
  const isRecommended = plan.badge === 'Popular';
  const resources = PLAN_RESOURCES[plan.id] ?? [];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(plan)}
      title={disabled ? disabledReason : undefined}
      className={`relative flex flex-col gap-4 w-full text-left border-2 p-6 ${
        disabled
          ? 'border-border bg-surface/70 cursor-not-allowed'
          : isSelected
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/15'
          : isRecommended
          ? 'border-primary/30 bg-surface hover:border-primary/60'
          : 'border-border bg-surface hover:border-border-light'
      } ${disabled ? '' : ' '}`}
    >
      {/* Most Popular badge */}
      {isRecommended && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-white text-[11px] font-bold px-4 py-1 uppercase tracking-wide whitespace-nowrap">
            Most Popular
          </span>
        </div>
      )}

      {/* Selected check */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-5 h-5 bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Price badge */}
      {(() => {
        const c = PLAN_COLORS[plan.id] ?? PLAN_COLORS.free;
        return (
          <div className={`flex flex-col items-center justify-center gap-0.5 px-4 py-3 h-20 ${c.bg} border ${c.border} `}>
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
      <div className={`flex items-center justify-center gap-1.5 px-3 py-1 border border-border text-[11px] font-semibold uppercase tracking-wide w-fit mx-auto ${
        disabled ? 'text-text-muted bg-surface-hover/60' : 'text-text-secondary'
      }`}>
        {disabled ? <Lock className="w-3 h-3 shrink-0" /> : <Gift className="w-3 h-3 shrink-0" />}
        {disabled ? 'Unavailable' : plan.priceMonthly === 0 ? 'Free forever*' : 'First month free*'}
      </div>

      {/* Plan header */}
      <div className="text-center pb-4 border-b border-border flex flex-col justify-center min-h-[5rem]">
        <h3 className="font-heading text-xl font-semibold text-text mb-1">{plan.label}</h3>
        <p className={`text-sm ${disabled ? 'text-text-secondary' : 'text-text-muted'}`}>
          {disabled ? disabledReason : plan.description}
        </p>
      </div>

      {/* Resource rows */}
      <div className="flex flex-col gap-2.5 flex-1">
        {resources.map((resource) => {
          const Icon = resource.icon;
          return (
            <div
              key={resource.label}
              className="grid gap-2.5 items-center px-3 py-2 bg-surface-hover "
              style={{ gridTemplateColumns: '24px 1fr auto' }}
            >
              <Icon className="w-4 h-4 text-text-muted" />
              <span className="text-xs text-text-secondary font-medium">{resource.label}</span>
              <span className="text-xs font-semibold text-text text-right">{resource.value}</span>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="pt-1">
        <div className={`w-full py-2.5 text-sm font-semibold text-center flex items-center justify-center gap-1.5 ${
          disabled
            ? 'bg-surface-hover text-text-muted border border-border'
            : isSelected
            ? 'bg-primary/10 text-primary border border-primary/30'
            : isRecommended
            ? 'bg-primary text-white'
            : 'bg-surface-hover text-text border border-border'
        }`}>
          {disabled ? (
            <><Lock className="w-4 h-4" /> Choose another plan</>
          ) : isSelected ? (
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

export default function Step1Plan({ plan, onChange }) {
  const { apps } = useApps();
  const freePlanDisabled = apps.length >= 1;
  const freePlanDisabledReason = 'The Free plan is available only for your first Orbit app.';

  function handleSelect(p) {
    if (p.id === 'custom') {
      onChange(normalizeCustomPlan(p));
    } else {
      onChange(p);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <LayoutGrid className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Select your plan</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Choose your plan based on your resource needs.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {PLANS.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            selected={plan}
            disabled={p.id === 'free' && freePlanDisabled}
            disabledReason={p.id === 'free' ? freePlanDisabledReason : ''}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-4 bg-surface-hover border border-border space-y-2">
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-secondary" />
          Restrictions may apply to prevent abuse.
        </p>
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-secondary" />
          The Free plan is automatically renewed
          as long as you have only one Git app running. Additional Git apps are charged $0.99/month each.
        </p>
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-secondary" />
          The Free plan runs on a single instance. Brief downtime may occur if the hosting node restarts.
          For high-availability apps, Standard or Pro plans are recommended.
        </p>
        <p className="text-xs text-text-muted leading-relaxed flex items-start gap-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-secondary" />
          Private GitHub repositories are deployed as Enterprise apps (+$1.33/mo on Free,
          +$2.66/mo on Standard, Pro, and Custom).
        </p>
      </div>
    </div>
  );
}
