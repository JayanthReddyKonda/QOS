import type { SimConfig, SimStatus } from '../types/simulation';
import { LOAD_PROFILE_LABELS } from '../types/simulation';

interface Props {
  config: SimConfig;
  onChange: (c: SimConfig) => void;
  onRun: () => void;
  onReset: () => void;
  status: SimStatus;
}

export function ControlPanel({ config, onChange, onRun, onReset, status }: Props) {
  const running = status === 'connecting' || status === 'running_fifo'
               || status === 'running_spq' || status === 'running_wfq';
  const set = <K extends keyof SimConfig>(key: K, value: SimConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="space-y-5">
      {/* Run / Reset */}
      <div className="space-y-2">
        <button
          onClick={onRun}
          disabled={running}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-lg text-sm transition-colors shadow-sm"
        >
          {running ? 'Simulating…' : '▶ Run Simulation'}
        </button>
        <button
          onClick={onReset}
          disabled={running}
          className="w-full py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-semibold rounded-lg text-sm transition-colors border border-gray-200"
        >
          Reset
        </button>
      </div>

      <hr className="border-gray-200" />

      {/* Parameters */}
      <div className="space-y-4">
        <p className="section-title">Simulation Parameters</p>

        <Field label="Load Profile">
          <select
            value={config.load_profile}
            onChange={(e) => set('load_profile', e.target.value as SimConfig['load_profile'])}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(LOAD_PROFILE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>

        <Field label={`Link Capacity: ${config.link_mbps} Mbps`}>
          <input type="range" min={1} max={100} step={1}
            value={config.link_mbps}
            onChange={(e) => set('link_mbps', Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </Field>

        <Field label={`Buffer Limit: ${config.buffer_limit} packets`}>
          <input type="range" min={5} max={200} step={5}
            value={config.buffer_limit}
            onChange={(e) => set('buffer_limit', Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </Field>

        <Field label={`Propagation Delay: ${config.prop_delay_ms} ms`}>
          <input type="range" min={1} max={100} step={1}
            value={config.prop_delay_ms}
            onChange={(e) => set('prop_delay_ms', Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </Field>

        <Field label={`Duration: ${config.duration_ms / 1000} s`}>
          <input type="range" min={1000} max={10000} step={1000}
            value={config.duration_ms}
            onChange={(e) => set('duration_ms', Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </Field>

        <Field label="Random Seed">
          <input
            type="number" min={0} max={99999}
            value={config.seed}
            onChange={(e) => set('seed', Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">Same seed = same workload = reproducible</p>
        </Field>
      </div>

      <hr className="border-gray-200" />

      {/* Traffic class info */}
      <div>
        <p className="section-title">Traffic Classes</p>
        <div className="space-y-2">
          {[
            { cls: 'Voice',  color: 'bg-green-500',  label: 'Priority 4 · 160 B fixed',   weight: 'WFQ w=4' },
            { cls: 'Video',  color: 'bg-blue-500',   label: 'Priority 3 · 400–1400 B',    weight: 'WFQ w=3' },
            { cls: 'Web',    color: 'bg-amber-500',  label: 'Priority 2 · 200–1500 B',    weight: 'WFQ w=2' },
            { cls: 'File',   color: 'bg-gray-400',   label: 'Priority 1 · 1000–1500 B',   weight: 'WFQ w=1' },
          ].map(({ cls, color, label, weight }) => (
            <div key={cls} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="font-semibold text-gray-700">{cls}</span>
              </div>
              <div className="text-right">
                <div className="text-gray-500">{label}</div>
                <div className="text-teal-600 font-mono font-semibold">{weight}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Scheduler legend */}
      <div>
        <p className="section-title">Schedulers</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-blue-500 flex-shrink-0" />
            <span className="text-gray-700"><strong>FIFO</strong> — arrival order, no priority</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-violet-500 flex-shrink-0" />
            <span className="text-gray-700"><strong>SPQ</strong> — absolute priority, non-preemptive</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-teal-500 flex-shrink-0" />
            <span className="text-gray-700"><strong>WFQ</strong> — virtual finish time, proportional BW</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
        ⚠ Shared tail-drop buffer: a high-priority class can still be dropped if lower-priority
        packets already fill the buffer before it arrives.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
