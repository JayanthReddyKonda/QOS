import { useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { ControlPanel } from './components/ControlPanel';
import { OverviewTab } from './components/tabs/OverviewTab';
import { ComparisonTab } from './components/tabs/ComparisonTab';
import { ChartsTab } from './components/tabs/ChartsTab';
import { QueueTab } from './components/tabs/QueueTab';
import { PacketTraceTab } from './components/tabs/PacketTraceTab';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import type { SimConfig, PolicyType } from './types/simulation';

// ─── defaults ────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: SimConfig = {
  seed: 42,
  load_profile: 'congested',
  link_mbps: 10,
  buffer_limit: 50,
  prop_delay_ms: 10,
  duration_ms: 5000,
};

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'comparison', label: 'Class Comparison' },
  { id: 'charts',     label: 'Charts' },
  { id: 'queue',      label: 'Queue Analysis' },
  { id: 'packets',    label: 'Packet Trace' },
  { id: 'guide',      label: 'How It Works' },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Status metadata ──────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string }> = {
  idle:         { label: 'Ready',          dot: 'bg-gray-300' },
  connecting:   { label: 'Connecting…',    dot: 'bg-amber-400 animate-ping' },
  running_fifo: { label: 'Running FIFO…',  dot: 'bg-blue-500 animate-ping' },
  running_spq:  { label: 'Running SPQ…',   dot: 'bg-violet-500 animate-ping' },
  running_wfq:  { label: 'Running WFQ…',   dot: 'bg-teal-500 animate-ping' },
  complete:     { label: 'Complete',        dot: 'bg-green-500' },
  error:        { label: 'Error',          dot: 'bg-red-500' },
};

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig]       = useState<SimConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const sim = useSimulation();

  const isRunning = ['connecting', 'running_fifo', 'running_spq', 'running_wfq'].includes(sim.status);
  const meta = STATUS_META[sim.status] ?? STATUS_META.idle;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-5 py-0 flex items-center justify-between flex-shrink-0" style={{ height: '52px' }}>
        {/* Brand */}
        <div className="flex items-center gap-3">
          {/* Text-mark logo — no icon library, no generic clip-art */}
          <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-600 select-none">
            <span className="text-white font-black text-sm font-mono leading-none tracking-tighter">QS</span>
          </div>
          <div className="leading-none">
            <span className="text-sm font-bold text-gray-900 tracking-tight">QoS Traffic Manager</span>
            <span className="hidden sm:inline text-gray-400 text-xs ml-2">
              FIFO · SPQ · WFQ · {config.link_mbps} Mbps link
            </span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Live progress — only shown while running */}
          {isRunning && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-md">
              {(['fifo', 'spq', 'wfq'] as PolicyType[]).map((p) => (
                <span key={p} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p === 'fifo' ? 'bg-blue-500' : p === 'spq' ? 'bg-violet-500' : 'bg-teal-500'
                  }`} />
                  {p.toUpperCase()} {sim.progress[p].toFixed(0)}%
                </span>
              ))}
            </div>
          )}

          {/* Status chip */}
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Sidebar */}
        <aside className="w-68 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto" style={{ width: '272px' }}>
          <div className="p-4">
            <ControlPanel
              config={config}
              onChange={setConfig}
              onRun={() => sim.run(config)}
              onReset={sim.reset}
              status={sim.status}
            />
          </div>
        </aside>

        {/* Main workspace */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Error banner */}
          {sim.error && (
            <div className="bg-red-50 border-b border-red-200 px-5 py-2.5 text-red-700 text-xs flex items-center gap-2 flex-shrink-0">
              <span className="font-bold">Error:</span> {sim.error}
            </div>
          )}

          {/* Tab bar */}
          <div className="bg-gray-100 border-b border-gray-200 px-3 py-1.5 flex gap-0.5 flex-shrink-0 overflow-x-auto">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`tab-btn ${activeTab === id ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'guide' ? (
              <div className="p-6 max-w-4xl"><ArchitectureGuide /></div>
            ) : sim.status === 'idle' ? (
              <EmptyState onRun={() => sim.run(config)} onGuide={() => setActiveTab('guide')} config={config} />
            ) : isRunning ? (
              <RunningState status={sim.status} progress={sim.progress} totalPackets={sim.totalPackets} snapshots={sim.snapshots} />
            ) : sim.status === 'complete' && sim.results ? (
              <div className="p-5">
                {activeTab === 'overview'   && <OverviewTab   results={sim.results} config={config} />}
                {activeTab === 'comparison' && <ComparisonTab results={sim.results} />}
                {activeTab === 'charts'     && <ChartsTab     results={sim.results} snapshots={sim.snapshots} />}
                {activeTab === 'queue'      && <QueueTab      results={sim.results} />}
                {activeTab === 'packets'    && <PacketTraceTab results={sim.results} />}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onRun, onGuide, config }: {
  onRun: () => void; onGuide: () => void; config: SimConfig;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-8 text-center gap-7">

      {/* Title block */}
      <div className="space-y-2 max-w-lg">
        <h2 className="text-xl font-bold text-gray-900">Select parameters and run the simulation</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          The same synthetic Poisson workload is replayed identically through{' '}
          <strong className="text-gray-700">FIFO</strong>,{' '}
          <strong className="text-gray-700">SPQ</strong>, and{' '}
          <strong className="text-gray-700">WFQ</strong> — giving a direct, controlled comparison
          on a {config.link_mbps} Mbps congested link.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={onRun}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          Run Simulation
        </button>
        <button
          onClick={onGuide}
          className="px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium rounded-lg text-sm transition-colors"
        >
          Architecture Guide
        </button>
      </div>

      {/* Algorithm reference table — cleaner than coloured cards */}
      <div className="w-full max-w-2xl border border-gray-200 rounded-xl overflow-hidden bg-white text-left">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduler Reference</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Algorithm</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Selection Policy</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Guarantee</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Trade-off</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                color: 'bg-blue-500',
                name: 'FIFO (Baseline)',
                policy: 'Arrival order',
                guarantee: 'Fair average service',
                tradeoff: 'Voice/video blocked by bulk transfers',
              },
              {
                color: 'bg-violet-500',
                name: 'SPQ — Strict Priority',
                policy: 'Highest-priority non-empty queue',
                guarantee: 'Voice always served first',
                tradeoff: 'Low-priority classes can starve',
              },
              {
                color: 'bg-teal-500',
                name: 'WFQ — Weighted Fair',
                policy: 'Min virtual-finish-time (w: 4/3/2/1)',
                guarantee: 'Proportional bandwidth per weight',
                tradeoff: 'Higher complexity; no absolute priority',
              },
            ].map((r) => (
              <tr key={r.name} className="border-t border-gray-100">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.color}`} />
                    <span className="font-semibold text-gray-800">{r.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{r.policy}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.guarantee}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.tradeoff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Running state ────────────────────────────────────────────────────────────
function RunningState({
  status,
  progress,
  totalPackets,
  snapshots,
}: {
  status: string;
  progress: Record<PolicyType, number>;
  totalPackets: number;
  snapshots: Record<PolicyType, { queue_lengths: Record<string, number> }[]>;
}) {
  const currentPolicy = status === 'running_wfq' ? 'wfq' : status === 'running_spq' ? 'spq' : 'fifo';
  const latest = snapshots[currentPolicy as PolicyType];
  const latestSnap = latest[latest.length - 1] ?? null;

  const policies: { key: PolicyType; label: string; bar: string }[] = [
    { key: 'fifo', label: 'FIFO', bar: 'bg-blue-500' },
    { key: 'spq',  label: 'SPQ',  bar: 'bg-violet-500' },
    { key: 'wfq',  label: 'WFQ',  bar: 'bg-teal-500' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-10 px-6 gap-7">

      {/* Phase label */}
      <div className="text-center space-y-1">
        <h3 className="text-lg font-bold text-gray-900">
          Simulating {currentPolicy.toUpperCase()}
        </h3>
        <p className="text-gray-400 text-xs font-mono">
          {totalPackets.toLocaleString()} packets · {['fifo','spq','wfq'].indexOf(currentPolicy) + 1} of 3 phases
        </p>
      </div>

      {/* Progress */}
      <div className="w-full max-w-md card p-5 space-y-4">
        {policies.map(({ key, label, bar }) => (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-gray-600">{label}</span>
              <span className="font-mono text-gray-700">{progress[key].toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${bar}`}
                style={{ width: `${progress[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Live queue counts */}
      {latestSnap && (
        <div className="w-full max-w-md card p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
            Live queue depth — {currentPolicy.toUpperCase()}
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(['voice', 'video', 'web', 'file'] as const).map((cls) => {
              const colorMap = {
                voice: 'border-green-200 text-green-700 bg-green-50',
                video: 'border-blue-200 text-blue-700 bg-blue-50',
                web:   'border-amber-200 text-amber-700 bg-amber-50',
                file:  'border-gray-200 text-gray-600 bg-gray-50',
              };
              return (
                <div key={cls} className={`rounded-lg p-2.5 border text-center ${colorMap[cls]}`}>
                  <div className="text-lg font-black font-mono">
                    {latestSnap.queue_lengths?.[cls] ?? 0}
                  </div>
                  <div className="text-[10px] capitalize font-semibold mt-0.5">{cls}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
