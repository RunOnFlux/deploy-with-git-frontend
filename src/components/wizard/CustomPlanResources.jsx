import { Server } from 'lucide-react';
import { normalizeCustomPlan } from '../../services/deployService';
import { DB_MIN_INSTANCES, formatRamMb } from '../../services/databaseSpec';
import ResourceSlider from './ResourceSlider';

function InstancesPicker({ value, min, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">Instances</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => {
            const disabled = n < min;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange(n)}
                className={`w-8 h-8 text-sm font-semibold border ${
                  value === n
                    ? 'bg-primary text-white border-primary'
                    : disabled
                    ? 'bg-surface-hover/50 text-text-muted/40 border-border cursor-not-allowed'
                    : 'bg-surface-hover text-text-secondary border-border hover:border-primary/50'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-text-muted">
        {min > 1
          ? `At least ${min} instances required when a database or Redis addon is enabled.`
          : 'Multiple instances improve uptime on the decentralized network.'}
      </p>
    </div>
  );
}

/** Read-only resource summary for fixed plans (Free, Standard, Pro). */
export function PlanResourceSummary({ plan }) {
  if (!plan || plan.id === 'custom') return null;

  const ramLabel = plan.ram >= 1000 ? `${plan.ram / 1000} GB` : formatRamMb(plan.ram);

  return (
    <div className="mb-5 border border-border bg-surface/40 p-4">
      <div className="flex items-start gap-3 mb-3">
        <Server className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-text">App container</p>
          <p className="text-xs text-text-muted mt-0.5">
            Resources from your {plan.label} plan. Change plan on step 1 to adjust.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/40">
        {[
          { label: 'CPU', value: `${plan.cpu} vCPU` },
          { label: 'RAM', value: ramLabel },
          { label: 'Storage', value: `${plan.hdd} GB` },
          { label: 'Instances', value: String(plan.instances) },
        ].map(({ label, value }) => (
          <div key={label} className=" bg-background/40 border border-border/40 px-3 py-2">
            <p className="text-[10px] text-text-muted uppercase tracking-wide">{label}</p>
            <p className="text-sm font-semibold text-text mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Custom plan app container resource sliders. */
export default function CustomPlanResources({ plan, config, onPlanChange }) {
  if (plan?.id !== 'custom') return null;

  const custom = normalizeCustomPlan(plan);
  const clusterAddonEnabled = config?.database?.enabled || config?.redis?.enabled;
  const minInstances = clusterAddonEnabled ? DB_MIN_INSTANCES : 1;

  function handleField(field, value) {
    onPlanChange?.(normalizeCustomPlan({ ...custom, [field]: value }));
  }

  function handleInstances(n) {
    handleField('instances', Math.max(n, minInstances));
  }

  return (
    <div className="mb-5 border border-border bg-surface/40 p-4">
      <div className="flex items-start gap-3 mb-3">
        <Server className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-text">App container</p>
          <p className="text-xs text-text-muted mt-0.5">
            Configure CPU, memory, storage, and instances for your application container.
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-border/40">
        <ResourceSlider
          label="CPU"
          value={custom.cpu}
          valueLabel={`${custom.cpu} vCPU`}
          min={0.1}
          max={15}
          step={0.1}
          onChange={(cpu) => handleField('cpu', cpu)}
        />
        <ResourceSlider
          label="RAM"
          value={custom.ram / 1000}
          valueLabel={formatRamMb(custom.ram)}
          min={0.1}
          max={59}
          step={0.5}
          onChange={(ramGb) => handleField('ram', Math.round(ramGb * 1000))}
        />
        <ResourceSlider
          label="Storage"
          value={custom.hdd}
          valueLabel={`${custom.hdd} GB`}
          min={1}
          max={820}
          step={1}
          onChange={(hdd) => handleField('hdd', hdd)}
        />
        <InstancesPicker
          value={custom.instances}
          min={minInstances}
          onChange={handleInstances}
        />
        <p className="text-[11px] text-text-muted pt-1">
          Price is calculated at checkout based on selected resources.
        </p>
      </div>
    </div>
  );
}
