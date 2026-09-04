import { HardDrive, Plus, Trash2 } from 'lucide-react';

import {
  MAX_PERSISTENT_FOLDERS,
  validatePersistentFolders,
} from '../../services/persistentVolumeService';

function nextFolder(folders) {
  let number = folders.length + 1;
  let name = number === 1 ? 'data' : `data-${number}`;
  while (folders.some((folder) => folder.name === name)) {
    number += 1;
    name = `data-${number}`;
  }
  return { name, path: number === 1 ? '/data' : `/data-${number}` };
}

export default function PersistentFolders({ folders = [], instances = 1, onChange }) {
  const validation = validatePersistentFolders(folders);
  const replicationAvailable = Number(instances) >= 2;

  function update(index, patch) {
    onChange(folders.map((folder, current) => current === index ? { ...folder, ...patch } : folder));
  }

  return (
    <div className="border border-border bg-surface/40 p-4 mt-4">
      <div className="flex items-start gap-3">
        <HardDrive className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">Replicated persistent folders</p>
          <p className="text-xs text-text-muted mt-0.5">
            Keep application data synchronized across Flux instances. Use dedicated paths such as <code className="font-mono">/data</code> or <code className="font-mono">/uploads</code>; Orbit&apos;s build directories are protected.
          </p>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="space-y-3 mt-4">
          {folders.map((folder, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(12rem,1.3fr)_auto] items-start">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Volume folder name</label>
                <input
                  type="text"
                  value={folder.name}
                  maxLength={64}
                  placeholder="uploads"
                  onChange={(event) => update(index, { name: event.target.value })}
                  className={`input-base w-full font-mono text-sm ${validation.errors[index] ? 'border-red-500/50' : ''}`}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Path inside your app</label>
                <input
                  type="text"
                  value={folder.path}
                  maxLength={160}
                  placeholder="/uploads"
                  onChange={(event) => update(index, { path: event.target.value })}
                  className={`input-base w-full font-mono text-sm ${validation.errors[index] ? 'border-red-500/50' : ''}`}
                />
                {validation.errors[index] && <p className="text-xs text-red-400 mt-1">{validation.errors[index]}</p>}
              </div>
              <button
                type="button"
                onClick={() => onChange(folders.filter((_, current) => current !== index))}
                className="p-2 mt-5 text-text-muted hover:text-danger hover:bg-danger/10"
                aria-label={`Remove persistent folder ${index + 1}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {validation.error && <p className="text-xs text-red-400 mt-3">{validation.error}</p>}
      {!replicationAvailable && (
        <p className="text-xs text-amber-400 mt-3">
          Replicated folders require a plan with at least 2 app instances.
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange([...folders, nextFolder(folders)])}
        disabled={!replicationAvailable || folders.length >= MAX_PERSISTENT_FOLDERS}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover disabled:opacity-40 mt-4"
      >
        <Plus className="w-4 h-4" /> Add persistent folder
      </button>
      <p className="text-xs text-text-muted mt-2">
        Adding folders enables Flux primary–standby replication for this app&apos;s persistent volume.
      </p>
    </div>
  );
}
