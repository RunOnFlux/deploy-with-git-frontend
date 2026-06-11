import { normalizeCustomPlan } from '../../services/deployService';
import { DB_MIN_INSTANCES, formatRamMb } from '../../services/databaseSpec';

export default function CustomPlanResources({ plan, config, onPlanChange }) {
  if (plan?.id !== 'custom') return null;

  const custom = normalizeCustomPlan(plan);
  const dbEnabled = config?.database?.enabled;
  const minInstances = dbEnabled ? DB_MIN_INSTANCES : 1;

  function handleField(field, value) {
    onPlanChange?.(normalizeCustomPlan({ ...custom, [field]: value }));
  }

  function handleInstances(n) {
    handleField('instances', Math.max(n, minInstances));
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
      <h3 className="text-sm font-semibold text-text mb-1">App resources</h3>
      <p className="text-xs text-text-muted mb-5">
        Configure CPU, memory, storage, and instances for your application container.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">CPU</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0.1"
                max="15"
                step="0.1"
                value={custom.cpu}
                onChange={(e) => handleField('cpu', Math.min(15, Math.max(0.1, parseFloat(e.target.value) || 0.1)))}
                className="input-base w-20 text-right text-sm py-1"
              />
              <span className="text-xs text-text-muted">Cores</span>
            </div>
          </div>
          <input
            type="range"
            min="0.1"
            max="15"
            step="0.1"
            value={custom.cpu}
            onChange={(e) => handleField('cpu', parseFloat(e.target.value))}
            className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>0.1</span>
            <span>15 Cores</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">RAM</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0.1"
                max="59"
                step="0.5"
                value={Math.round((custom.ram / 1000) * 10) / 10}
                onChange={(e) => handleField('ram', Math.round(Math.min(59, Math.max(0.1, parseFloat(e.target.value) || 0.1)) * 1000))}
                className="input-base w-20 text-right text-sm py-1"
              />
              <span className="text-xs text-text-muted">GB</span>
            </div>
          </div>
          <input
            type="range"
            min="0.1"
            max="59"
            step="0.5"
            value={custom.ram / 1000}
            onChange={(e) => handleField('ram', Math.round(parseFloat(e.target.value) * 1000))}
            className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>{formatRamMb(100)}</span>
            <span>59 GB</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Storage</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="820"
                step="1"
                value={custom.hdd}
                onChange={(e) => handleField('hdd', Math.min(820, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="input-base w-20 text-right text-sm py-1"
              />
              <span className="text-xs text-text-muted">GB</span>
            </div>
          </div>
          <input
            type="range"
            min="1"
            max="820"
            step="1"
            value={custom.hdd}
            onChange={(e) => handleField('hdd', parseInt(e.target.value, 10))}
            className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>1 GB</span>
            <span>820 GB</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Instances</span>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((n) => {
                const disabled = dbEnabled && n < DB_MIN_INSTANCES;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleInstances(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                      custom.instances === n
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
          <p className="text-[10px] text-text-muted mt-1">
            {dbEnabled
              ? `At least ${DB_MIN_INSTANCES} instances required when a database is enabled.`
              : 'Multiple instances improve uptime on the decentralized network.'}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-muted mt-5 pt-4 border-t border-border">
        Price is calculated at checkout based on selected resources.
      </p>
    </div>
  );
}
