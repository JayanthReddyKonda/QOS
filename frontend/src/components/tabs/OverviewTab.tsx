import type { SimResults, SimConfig } from '../../types/simulation';
import { LOAD_PROFILE_DETAILS, POLICY_COLORS } from '../../types/simulation';
import { ExportButton } from '../ExportButton';

const fmt = (v: number | null | undefined, unit = '', d = 2) =>
  v == null ? 'N/A' : `${v.toFixed(d)}${unit ? ' ' + unit : ''}`;

const delta = (a: number | null, b: number | null, unit = '') => {
  if (a == null || b == null) return '—';
  const d = b - a;
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}${unit}`;
};

export function OverviewTab({ results, config }: { results: SimResults; config: SimConfig }) {
  const f = results.fifo;
  const s = results.spq;
  const w = results.wfq;

  const voiceDelays = { fifo: f.per_class.voice.avg_e2e_delay_ms ?? 0,
                        spq:  s.per_class.voice.avg_e2e_delay_ms ?? 0,
                        wfq:  w.per_class.voice.avg_e2e_delay_ms ?? 0 };

  const loadInfo = LOAD_PROFILE_DETAILS[config.load_profile] ?? {
    label: config.load_profile,
    desc: 'Custom config',
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  };

  // Key finding
  const spqSaving = voiceDelays.fifo > 0
    ? ((voiceDelays.fifo - voiceDelays.spq) / voiceDelays.fifo * 100).toFixed(0)
    : '0';
  const wfqSaving = voiceDelays.fifo > 0
    ? ((voiceDelays.fifo - voiceDelays.wfq) / voiceDelays.fifo * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-black text-gray-900">Simulation Overview</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${loadInfo.color}`}>
              {loadInfo.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {f.generated} packets generated · {config.link_mbps} Mbps bottleneck · {config.duration_ms / 1000}s duration
          </p>
        </div>
        <ExportButton results={results} />
      </div>

      {/* Key insight banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
        <span className="font-bold text-blue-800">Key Finding: </span>
        Under <em>{loadInfo.label}</em>, SPQ reduced Voice E2E latency by <strong className="text-violet-700">{spqSaving}%</strong>
        {' '}({fmt(voiceDelays.fifo, 'ms')} → {fmt(voiceDelays.spq, 'ms')}). WFQ reduced it by <strong className="text-teal-700">{wfqSaving}%</strong>
        {' '}({fmt(voiceDelays.wfq, 'ms')}). Total throughput remained nearly identical across all three policies — QoS
        reorders priorities without requiring extra bandwidth.
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Voice delay */}
        <MetricCard title="Voice E2E Delay" subtitle="Priority 4 (real-time)">
          <PolicyRow label="FIFO" value={fmt(voiceDelays.fifo, 'ms')} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={fmt(voiceDelays.spq, 'ms')}  color="text-violet-700" />
          <PolicyRow label="WFQ"  value={fmt(voiceDelays.wfq, 'ms')}  color="text-teal-700" />
        </MetricCard>

        {/* Throughput */}
        <MetricCard title="Delivered Throughput" subtitle="Link utilization">
          <PolicyRow label="FIFO" value={fmt(f.throughput_mbps, 'Mbps')} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={fmt(s.throughput_mbps, 'Mbps')} color="text-violet-700" />
          <PolicyRow label="WFQ"  value={fmt(w.throughput_mbps, 'Mbps')} color="text-teal-700" />
        </MetricCard>

        {/* Drops */}
        <MetricCard title="Packets Dropped" subtitle="Tail-drop buffer overflow">
          <PolicyRow label="FIFO" value={`${f.dropped} (${fmt(f.drop_rate_pct, '%')})`} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={`${s.dropped} (${fmt(s.drop_rate_pct, '%')})`} color="text-violet-700" />
          <PolicyRow label="WFQ"  value={`${w.dropped} (${fmt(w.drop_rate_pct, '%')})`} color="text-teal-700" />
        </MetricCard>

        {/* Offered load */}
        <MetricCard title="Offered Load" subtitle={`${fmt(f.offered_load_pct, '%')} of link`}>
          <div className="text-2xl font-black font-mono text-gray-900 mt-1">{fmt(f.offered_load_mbps, 'Mbps')}</div>
          <div className="text-xs text-gray-500 mt-1">Link capacity: {config.link_mbps} Mbps</div>
          <div className={`text-xs font-semibold mt-0.5 ${f.offered_load_pct > 100 ? 'text-red-600' : 'text-green-600'}`}>
            {f.offered_load_pct > 100 ? '⚠ Congested' : '✓ Under Capacity'}
          </div>
        </MetricCard>
      </div>

      {/* Aggregate metrics table */}
      <div className="card overflow-x-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">Aggregate Metrics Comparison</h3>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span style={{ color: POLICY_COLORS.fifo }}>● FIFO</span>
              <span style={{ color: POLICY_COLORS.spq  }}>● SPQ</span>
              <span style={{ color: POLICY_COLORS.wfq  }}>● WFQ</span>
            </div>
          </div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-left">
              <th className="px-4 py-2.5 font-semibold">Metric</th>
              <th className="px-4 py-2.5 font-semibold text-right text-blue-700">FIFO</th>
              <th className="px-4 py-2.5 font-semibold text-right text-violet-700">SPQ</th>
              <th className="px-4 py-2.5 font-semibold text-right text-teal-700">WFQ</th>
              <th className="px-4 py-2.5 font-semibold text-right">SPQ−FIFO</th>
              <th className="px-4 py-2.5 font-semibold text-left pl-5 text-gray-400">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Generated Packets',        fv: String(f.generated),             sv: String(s.generated),             wv: String(w.generated),              d: '0',   note: 'Identical workload replayed for all 3 policies' },
              { label: 'Delivered Packets',        fv: String(f.delivered),             sv: String(s.delivered),             wv: String(w.delivered),              d: String(s.delivered - f.delivered), note: 'Packets successfully transmitted across link' },
              { label: 'Dropped Packets',          fv: String(f.dropped),               sv: String(s.dropped),               wv: String(w.dropped),                d: String(s.dropped - f.dropped), note: 'Tail-dropped when shared buffer is full' },
              { label: 'Drop Rate',                fv: fmt(f.drop_rate_pct, '%'),       sv: fmt(s.drop_rate_pct, '%'),       wv: fmt(w.drop_rate_pct, '%'),        d: delta(f.drop_rate_pct, s.drop_rate_pct, '%'), note: 'Fraction of generated packets lost' },
              { label: 'Throughput',               fv: fmt(f.throughput_mbps, 'Mbps'), sv: fmt(s.throughput_mbps, 'Mbps'), wv: fmt(w.throughput_mbps, 'Mbps'),   d: delta(f.throughput_mbps, s.throughput_mbps, 'Mbps'), note: 'Delivered bits over total simulation time' },
              { label: 'Link Utilization',         fv: fmt(f.link_utilization_pct, '%'), sv: fmt(s.link_utilization_pct, '%'), wv: fmt(w.link_utilization_pct, '%'), d: delta(f.link_utilization_pct, s.link_utilization_pct, '%'), note: 'Fraction of time link was active' },
              { label: 'Avg Queueing Delay',       fv: fmt(f.avg_queueing_delay_ms, 'ms'), sv: fmt(s.avg_queueing_delay_ms, 'ms'), wv: fmt(w.avg_queueing_delay_ms, 'ms'), d: delta(f.avg_queueing_delay_ms, s.avg_queueing_delay_ms, 'ms'), note: 'Buffer waiting time (all classes combined)' },
              { label: 'Avg E2E Latency',          fv: fmt(f.avg_e2e_delay_ms, 'ms'),  sv: fmt(s.avg_e2e_delay_ms, 'ms'),  wv: fmt(w.avg_e2e_delay_ms, 'ms'),    d: delta(f.avg_e2e_delay_ms, s.avg_e2e_delay_ms, 'ms'), note: 'Queue + transmission + propagation delay' },
              { label: 'Peak Buffer Occupancy',    fv: `${f.max_queue_occupancy} pkts`, sv: `${s.max_queue_occupancy} pkts`, wv: `${w.max_queue_occupancy} pkts`, d: String(s.max_queue_occupancy - f.max_queue_occupancy) + ' pkts', note: `Max queue depth (limit: ${config.buffer_limit} pkts)` },
            ].map(({ label, fv, sv, wv, d, note }, i) => (
              <tr key={label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fv}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-700">{sv}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-teal-700">{wv}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-500">{d}</td>
                <td className="px-4 py-2.5 text-gray-400 pl-5">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Packet conservation check */}
      <div className="card p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
          Packet Conservation Check (Spec §A6): Generated = Delivered + Dropped
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['fifo', 'spq', 'wfq'] as const).map((pol) => {
            const m = results[pol];
            const ok = m.generated === m.delivered + m.dropped;
            return (
              <div key={pol}
                className={`rounded-lg p-3 border flex items-center justify-between font-mono text-xs
                  ${ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}
              >
                <span>
                  <strong className="uppercase">{pol}</strong>:{' '}
                  {m.generated} = {m.delivered} + {m.dropped}
                </span>
                <span className="font-bold">{ok ? '✓ PASS' : '✗ FAIL'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-2">
      <div>
        <div className="text-xs font-bold text-gray-700">{title}</div>
        <div className="text-[10px] text-gray-400">{subtitle}</div>
      </div>
      <div className="space-y-1 pt-1">{children}</div>
    </div>
  );
}

function PolicyRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={`font-bold ${color}`}>{label}</span>
      <span className="font-mono text-gray-800">{value}</span>
    </div>
  );
}
