import { Check } from 'lucide-react';
import { PLANS } from '../../services/deployService';

const PLAN_COLORS = {
  free: 'border-border',
  developer: 'border-primary',
  pro: 'border-purple-500',
  custom: 'border-border',
};

const PLAN_BADGE_COLORS = {
  Popular: 'bg-primary/10 text-primary',
};

function PlanCard({ plan, selected, onSelect }) {
  const isSelected = selected?.id === plan.id;

  return (
    <button
      type="button"
      onClick={() => onSelect(plan)}
      className={`relative w-full text-left rounded-xl border-2 p-5 transition-all ${
        isSelected
          ? `${PLAN_COLORS[plan.id]} bg-primary/5 shadow-md`
          : 'border-border hover:border-border-hover bg-surface hover:bg-surface-hover'
      }`}
    >
      {/* Selected check */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Badge */}
      {plan.badge && (
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${PLAN_BADGE_COLORS[plan.badge]}`}>
          {plan.badge}
        </span>
      )}

      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-heading text-lg font-bold text-text">{plan.label}</span>
        {plan.priceMonthly !== null && (
          <span className="text-text-secondary text-sm">
            {plan.priceMonthly === 0 ? '— Free forever' : `— $${plan.priceMonthly}/mo`}
          </span>
        )}
      </div>
      <p className="text-xs text-text-muted mb-4">{plan.description}</p>

      {plan.id !== 'custom' ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span>💻 {plan.cpu} vCPU</span>
          <span>🧠 {plan.ram / 1000} GB RAM</span>
          <span>💾 {plan.hdd} GB storage</span>
          <span>🌐 {plan.instances} instance{plan.instances > 1 ? 's' : ''}</span>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Configure CPU, RAM, storage and instances yourself</p>
      )}

      {plan.priceMonthly !== 0 && plan.priceMonthly !== null && (
        <p className="text-xs text-primary mt-3 font-medium">First month free</p>
      )}
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
      <h2 className="font-heading text-xl font-bold text-text mb-1">Choose a plan</h2>
      <p className="text-sm text-text-secondary mb-6">
        All plans run on the Flux decentralized network with global redundancy.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PLANS.map((p) => (
          <PlanCard key={p.id} plan={p} selected={plan} onSelect={handleSelect} />
        ))}
      </div>

      {/* Custom plan configurator */}
      {plan?.id === 'custom' && (
        <div className="card p-5 mt-2">
          <h3 className="text-sm font-semibold text-text mb-4">Custom configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">CPU (vCPU)</span>
              <input
                type="number"
                min="0.1" max="8" step="0.1"
                value={custom?.cpu ?? 1}
                onChange={(e) => handleCustomField('cpu', parseFloat(e.target.value))}
                className="input-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">RAM (GB)</span>
              <input
                type="number"
                min="0.5" max="32" step="0.5"
                value={custom ? custom.ram / 1000 : 2}
                onChange={(e) => handleCustomField('ram', Math.round(parseFloat(e.target.value) * 1000))}
                className="input-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Storage (GB)</span>
              <input
                type="number"
                min="5" max="200" step="5"
                value={custom?.hdd ?? 10}
                onChange={(e) => handleCustomField('hdd', parseInt(e.target.value, 10))}
                className="input-base"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Instances</span>
              <input
                type="number"
                min="1" max="10" step="1"
                value={custom?.instances ?? 1}
                onChange={(e) => handleCustomField('instances', parseInt(e.target.value, 10))}
                className="input-base"
              />
            </label>
          </div>
          <p className="text-xs text-text-muted mt-3">
            Price is calculated at checkout based on selected resources.
          </p>
        </div>
      )}
    </div>
  );
}
