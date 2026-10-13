import { useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import type { LiveEvent } from './hooks/useSimulation';
import { ControlPanel } from './components/ControlPanel';
import { OverviewTab } from './components/tabs/OverviewTab';
import { ComparisonTab } from './components/tabs/ComparisonTab';
import { ChartsTab } from './components/tabs/ChartsTab';
import { QueueTab } from './components/tabs/QueueTab';
import { PacketTraceTab } from './components/tabs/PacketTraceTab';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import type { SimConfig, PolicyType, QueueSnapshot } from './types/simulation';
import { DROP_POLICY_LABELS } from './types/simulation';

// ─── defaults ────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: SimConfig = {
  seed: 42,
  load_profile: 'congested',
  link_mbps: 10,
  buffer_limit: 50,
  prop_delay_ms: 10,
  duration_ms: 5000,
  drop_policy: 'tail_drop',
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
  running_drr:  { label: 'Running DRR…',   dot: 'bg-rose-500 animate-ping' },
  complete:     { label: 'Complete',        dot: 'bg-green-500' },
  error:        { label: 'Error',           dot: 'bg-red-500' },
};

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig]       = useState<SimConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const sim = useSimulation();

  const isRunning = ['connecting', 'running_fifo', 'running_spq', 'running_wfq', 'running_drr'].includes(sim.status);
  const meta = STATUS_META[sim.status] ?? STATUS_META.idle;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-5 py-0 flex items-center justify-between flex-shrink-0" style={{ height: '52px' }}>
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="leading-none">
            <span className="text-sm font-bold text-gray-900 tracking-tight">QoS Traffic Manager</span>
            <span className="hidden sm:inline text-gray-400 text-xs ml-2">
              FIFO · SPQ · WFQ · DRR · {DROP_POLICY_LABELS[config.drop_policy]} · {config.link_mbps} Mbps
            </span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Live progress — only shown while running */}
          {isRunning && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-md">
              {(['fifo', 'spq', 'wfq', 'drr'] as PolicyType[]).map((p) => (
                <span key={p} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p === 'fifo' ? 'bg-blue-500' : p === 'spq' ? 'bg-violet-500' : p === 'wfq' ? 'bg-teal-500' : 'bg-rose-500'
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
              <RunningState
                status={sim.status}
                progress={sim.progress}
                totalPackets={sim.totalPackets}
                snapshots={sim.snapshots}
                liveCounters={sim.liveCounters}
                liveEvents={sim.liveEvents}
                config={config}
              />
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
          The same synthetic Poisson workload is replayed identically through all 4 schedulers:{' '}
          <strong className="text-gray-700">FIFO</strong>,{' '}
          <strong className="text-gray-700">SPQ</strong>,{' '}
          <strong className="text-gray-700">WFQ</strong>, and{' '}
          <strong className="text-gray-700">DRR</strong> with{' '}
          <span className="text-blue-700 font-semibold">{DROP_POLICY_LABELS[config.drop_policy]}</span> on a {config.link_mbps} Mbps bottleneck.
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

      {/* Scheduler reference table */}
      <div className="w-full max-w-3xl border border-gray-200 rounded-xl overflow-hidden bg-white text-left">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Scheduler Reference (Quartet)</span>
          <span className="text-[11px] font-mono text-gray-400">Buffer mode: {config.drop_policy}</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Algorithm</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Selection Policy</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Complexity</th>
              <th className="px-4 py-2 font-semibold text-gray-500 text-left">Guarantee / Trade-off</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                color: 'bg-blue-500',
                name: 'FIFO (Baseline)',
                policy: 'Arrival order',
                complexity: 'O(1)',
                guarantee: 'Simplest; voice blocked behind bulk transfers',
              },
              {
                color: 'bg-violet-500',
                name: 'SPQ — Strict Priority',
                policy: 'Highest-priority non-empty queue',
                complexity: 'O(P)',
                guarantee: 'Voice served first; bulk traffic may starve',
              },
              {
                color: 'bg-teal-500',
                name: 'WFQ — Weighted Fair',
                policy: 'Min virtual-finish-time (w: 4/3/2/1)',
                complexity: 'O(log N)',
                guarantee: 'Proportional bandwidth; high computational cost',
              },
              {
                color: 'bg-rose-500',
                name: 'DRR — Deficit Round Robin',
                policy: 'Round-robin with Deficit Counters',
                complexity: 'O(1) amortized',
                guarantee: 'Hardware-friendly fair queueing with quantum',
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
                <td className="px-4 py-2.5 font-mono text-gray-500">{r.complexity}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.guarantee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Running state ────────────────────────────────────────────────────────────

const CLASSES = ['voice', 'video', 'web', 'file'] as const;

const CLS_STYLE: Record<string, { label: string; dot: string; bar: string; text: string; bg: string; border: string }> = {
  voice: { label: 'Voice',         dot: 'bg-green-500',  bar: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  video: { label: 'Video',         dot: 'bg-blue-500',   bar: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
  web:   { label: 'Web',           dot: 'bg-amber-500',  bar: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  file:  { label: 'File Transfer', dot: 'bg-gray-400',   bar: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200'  },
};

const POLICY_STYLE: Record<string, { label: string; short: string; dot: string; bar: string; text: string; ring: string }> = {
  fifo: { label: 'FIFO (Baseline)',              short: 'FIFO', dot: 'bg-blue-500',   bar: 'bg-blue-500',   text: 'text-blue-700',   ring: 'ring-blue-300'   },
  spq:  { label: 'Strict Priority (SPQ)',        short: 'SPQ',  dot: 'bg-violet-500', bar: 'bg-violet-500', text: 'text-violet-700', ring: 'ring-violet-300' },
  wfq:  { label: 'Weighted Fair Queuing (WFQ)',  short: 'WFQ',  dot: 'bg-teal-500',   bar: 'bg-teal-500',   text: 'text-teal-700',   ring: 'ring-teal-300'   },
  drr:  { label: 'Deficit Round Robin (DRR)',    short: 'DRR',  dot: 'bg-rose-500',   bar: 'bg-rose-500',   text: 'text-rose-700',   ring: 'ring-rose-300'   },
};

const EVENT_STYLE: Record<string, { label: string; color: string }> = {
  admitted:  { label: 'ENQ',  color: 'text-blue-600' },
  dropped:   { label: 'DROP', color: 'text-red-600'  },
  delivered: { label: 'DEL',  color: 'text-green-600'},
};

function RunningState({
  status,
  progress,
  totalPackets,
  snapshots,
  liveCounters,
  liveEvents,
  config,
}: {
  status: string;
  progress: Record<PolicyType, number>;
  totalPackets: number;
  snapshots: Record<PolicyType, QueueSnapshot[]>;
  liveCounters: Record<PolicyType, { admitted: number; dropped: number }>;
  liveEvents: LiveEvent[];
  config: SimConfig;
}) {
  const currentPolicy: PolicyType =
    status === 'running_drr' ? 'drr' :
    status === 'running_wfq' ? 'wfq' :
    status === 'running_spq' ? 'spq' : 'fifo';

  const latestSnap =
    snapshots[currentPolicy][snapshots[currentPolicy].length - 1] ?? null;

  const policies: PolicyType[] = ['fifo', 'spq', 'wfq', 'drr'];
  const phaseIdx = policies.indexOf(currentPolicy);

  const maxQ = Math.max(config.buffer_limit, 10);

  const totalAdmitted = policies.reduce((s, p) => s + liveCounters[p].admitted, 0);
  const totalDropped  = policies.reduce((s, p) => s + liveCounters[p].dropped,  0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4 max-w-5xl mx-auto">

        {/* ── Phase stepper ──────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Simulation Pipeline — 4 Schedulers
            </p>
            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Buffer Drop: {DROP_POLICY_LABELS[config.drop_policy]}
            </span>
          </div>
          <div className="flex items-center gap-0">
            {policies.map((p, i) => {
              const ps   = POLICY_STYLE[p];
              const done = i < phaseIdx;
              const curr = i === phaseIdx;
              return (
                <div key={p} className="flex items-center flex-1">
                  <div className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg transition-all ${
                    curr ? `bg-gray-50 ring-2 ${ps.ring}` : ''
                  }`}>
                    <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                      done ? 'bg-gray-400 border-gray-400' :
                      curr ? `${ps.dot} border-transparent` :
                             'bg-white border-gray-300'
                    }`} />
                    <span className={`text-xs font-bold ${
                      done ? 'text-gray-400' : curr ? ps.text : 'text-gray-300'
                    }`}>{ps.short}</span>
                    <span className={`text-[10px] font-mono ${
                      curr ? 'text-gray-700 font-semibold' : 'text-gray-400'
                    }`}>
                      {done ? '100%' : `${progress[p].toFixed(0)}%`}
                    </span>
                  </div>
                  {i < policies.length - 1 && (
                    <div className={`h-px w-5 flex-shrink-0 ${i < phaseIdx ? 'bg-gray-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Main two-column area ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Left: queue depth bars */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Live Queue Depth — {POLICY_STYLE[currentPolicy].short}
              </p>
              <span className="text-[10px] font-mono text-gray-400">
                buffer limit: {config.buffer_limit} pkts
              </span>
            </div>

            {latestSnap ? (
              <div className="space-y-3">
                {CLASSES.map((cls) => {
                  const depth = latestSnap.queue_lengths?.[cls] ?? 0;
                  const pct   = Math.min((depth / maxQ) * 100, 100);
                  const cs    = CLS_STYLE[cls];
                  const warn  = pct > 80;
                  return (
                    <div key={cls}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                          <span className={`w-2 h-2 rounded-full ${cs.dot}`} />
                          {cs.label}
                        </span>
                        <span className={`text-xs font-mono font-bold ${warn ? 'text-red-600' : 'text-gray-700'}`}>
                          {depth} pkts
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-150 ${
                            warn ? 'bg-red-400' : cs.bar
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* In-service indicator */}
                {latestSnap.in_service && (() => {
                  const svc = latestSnap.in_service;
                  const cs  = CLS_STYLE[svc.traffic_class];
                  return (
                    <div className={`mt-3 px-3 py-2 rounded-lg border ${cs.border} ${cs.bg} flex items-center justify-between`}>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Transmitting</span>
                      <span className={`text-xs font-semibold ${cs.text}`}>
                        {cs.label} · {svc.payload_bytes} B
                      </span>
                    </div>
                  );
                })()}

                {/* Sim time */}
                <p className="text-[10px] font-mono text-gray-400 text-right">
                  t = {(latestSnap.sim_time_us / 1000).toFixed(1)} ms
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-sm text-gray-400">
                Waiting for first tick…
              </div>
            )}
          </div>

          {/* Right: per-policy progress + drop counters */}
          <div className="space-y-4">
            {/* Progress bars */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Completion Progress
              </p>
              <div className="space-y-3">
                {policies.map((p) => {
                  const ps = POLICY_STYLE[p];
                  const pct = progress[p];
                  const cnt = liveCounters[p];
                  return (
                    <div key={p}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className={`text-xs font-bold ${ps.text}`}>{ps.short}</span>
                        <span className="text-[10px] font-mono text-gray-500">
                          {cnt.admitted > 0 && (
                            <>{cnt.admitted.toLocaleString()} enqueued · <span className="text-red-500">{cnt.dropped.toLocaleString()} dropped</span></>
                          )}
                          {cnt.admitted === 0 && 'pending'}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-200 ${ps.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aggregate counters */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Aggregate Packet Accounting
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Generated" value={totalPackets.toLocaleString()} sub="workload" color="text-gray-800" />
                <Stat label="Enqueued"  value={totalAdmitted.toLocaleString()} sub="all 4 policies" color="text-blue-700" />
                <Stat label="Dropped"   value={totalDropped.toLocaleString()}  sub={config.drop_policy}   color="text-red-600"  />
              </div>
            </div>
          </div>
        </div>

        {/* ── Live event log ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Packet Event Log  <span className="font-normal normal-case text-gray-400">(latest {liveEvents.length} events)</span>
          </p>
          {liveEvents.length === 0 ? (
            <div className="text-xs text-gray-400 italic">Waiting for packet events…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1 pr-3 font-semibold text-gray-400 w-12">Event</th>
                    <th className="text-left py-1 pr-3 font-semibold text-gray-400 w-12">Policy</th>
                    <th className="text-left py-1 pr-3 font-semibold text-gray-400 w-20">Class</th>
                    <th className="text-right py-1 pr-3 font-semibold text-gray-400 w-16">Size</th>
                    <th className="text-right py-1 font-semibold text-gray-400">Arrival (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...liveEvents].reverse().map((ev) => {
                    const cs = CLS_STYLE[ev.cls] ?? { text: 'text-gray-500', dot: 'bg-gray-400', label: ev.cls };
                    const es = EVENT_STYLE[ev.event] ?? { label: ev.event.toUpperCase(), color: 'text-gray-500' };
                    const ps = POLICY_STYLE[ev.policy] ?? { short: ev.policy.toUpperCase(), text: 'text-gray-500' };
                    return (
                      <tr key={ev.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className={`py-1 pr-3 font-bold ${es.color}`}>{es.label}</td>
                        <td className={`py-1 pr-3 ${ps.text}`}>{ps.short}</td>
                        <td className="py-1 pr-3">
                          <span className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cs.dot}`} />
                            <span className={cs.text}>{cs.label}</span>
                          </span>
                        </td>
                        <td className="py-1 pr-3 text-right text-gray-600">{ev.bytes} B</td>
                        <td className="py-1 text-right text-gray-500">{(ev.time_us / 1000).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-black font-mono ${color}`}>{value}</div>
      <div className="text-[10px] font-semibold text-gray-600 mt-0.5">{label}</div>
      <div className="text-[9px] text-gray-400">{sub}</div>
    </div>
  );
}
