import type { SimResults, SimConfig } from '../../types/simulation';
import { LOAD_PROFILE_DETAILS, POLICY_COLORS, DROP_POLICY_LABELS, DROP_POLICY_DESCRIPTIONS } from '../../types/simulation';
import { ExportButton } from '../ExportButton';

const fmt = (v: number | null | undefined, unit = '', d = 2) =>
  v == null ? 'N/A' : `${v.toFixed(d)}${unit ? ' ' + unit : ''}`;

export function OverviewTab({ results, config }: { results: SimResults; config: SimConfig }) {
  const f = results.fifo;
  const s = results.spq;
  const w = results.wfq;
  const d = results.drr;

  const voiceDelays = {
    fifo: f.per_class.voice.avg_e2e_delay_ms ?? 0,
    spq:  s.per_class.voice.avg_e2e_delay_ms ?? 0,
    wfq:  w.per_class.voice.avg_e2e_delay_ms ?? 0,
    drr:  d.per_class.voice.avg_e2e_delay_ms ?? 0,
  };

  const loadInfo = LOAD_PROFILE_DETAILS[config.load_profile] ?? {
    label: config.load_profile,
    desc: 'Custom config',
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  };

  const spqSaving = voiceDelays.fifo > 0
    ? ((voiceDelays.fifo - voiceDelays.spq) / voiceDelays.fifo * 100).toFixed(0)
    : '0';
  const drrSaving = voiceDelays.fifo > 0
    ? ((voiceDelays.fifo - voiceDelays.drr) / voiceDelays.fifo * 100).toFixed(0)
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
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-semibold">
              Drop Policy: {DROP_POLICY_LABELS[config.drop_policy]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {f.generated} packets generated · 4 schedulers evaluated · {config.link_mbps} Mbps bottleneck · {config.duration_ms / 1000}s duration
          </p>
        </div>
        <ExportButton results={results} />
      </div>

      {/* Key insight banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed space-y-1.5">
        <div>
          <span className="font-bold text-blue-800">Key Finding: </span>
          Under <em>{loadInfo.label}</em> with <strong>{DROP_POLICY_LABELS[config.drop_policy]}</strong>, SPQ reduced Voice queue latency by <strong className="text-violet-700">{spqSaving}%</strong> ({fmt(voiceDelays.fifo, 'ms')} → {fmt(voiceDelays.spq, 'ms')}) and DRR by <strong className="text-rose-700">{drrSaving}%</strong> ({fmt(voiceDelays.drr, 'ms')}).
        </div>
        <div className="text-xs text-gray-600 bg-white/70 p-2.5 rounded-lg border border-blue-100">
          <strong>Buffer Drop Dynamics:</strong> {DROP_POLICY_DESCRIPTIONS[config.drop_policy]}
        </div>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Voice delay */}
        <MetricCard title="Voice E2E Delay" subtitle="Priority 4 (real-time)">
          <PolicyRow label="FIFO" value={fmt(voiceDelays.fifo, 'ms')} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={fmt(voiceDelays.spq, 'ms')}  color="text-violet-700" />
          <PolicyRow label="WFQ"  value={fmt(voiceDelays.wfq, 'ms')}  color="text-teal-700" />
          <PolicyRow label="DRR"  value={fmt(voiceDelays.drr, 'ms')}  color="text-rose-700" />
        </MetricCard>

        {/* Throughput */}
        <MetricCard title="Delivered Throughput" subtitle="Link utilization">
          <PolicyRow label="FIFO" value={fmt(f.throughput_mbps, 'Mbps')} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={fmt(s.throughput_mbps, 'Mbps')} color="text-violet-700" />
          <PolicyRow label="WFQ"  value={fmt(w.throughput_mbps, 'Mbps')} color="text-teal-700" />
          <PolicyRow label="DRR"  value={fmt(d.throughput_mbps, 'Mbps')} color="text-rose-700" />
        </MetricCard>

        {/* Drops */}
        <MetricCard title="Packets Dropped" subtitle={config.drop_policy}>
          <PolicyRow label="FIFO" value={`${f.dropped} (${fmt(f.drop_rate_pct, '%')})`} color="text-blue-700" />
          <PolicyRow label="SPQ"  value={`${s.dropped} (${fmt(s.drop_rate_pct, '%')})`} color="text-violet-700" />
          <PolicyRow label="WFQ"  value={`${w.dropped} (${fmt(w.drop_rate_pct, '%')})`} color="text-teal-700" />
          <PolicyRow label="DRR"  value={`${d.dropped} (${fmt(d.drop_rate_pct, '%')})`} color="text-rose-700" />
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
            <h3 className="text-sm font-bold text-gray-800">Aggregate Metrics Comparison (All 4 Schedulers)</h3>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span style={{ color: POLICY_COLORS.fifo }}>● FIFO</span>
              <span style={{ color: POLICY_COLORS.spq  }}>● SPQ</span>
              <span style={{ color: POLICY_COLORS.wfq  }}>● WFQ</span>
              <span style={{ color: POLICY_COLORS.drr  }}>● DRR</span>
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
              <th className="px-4 py-2.5 font-semibold text-right text-rose-700">DRR</th>
              <th className="px-4 py-2.5 font-semibold text-left pl-5 text-gray-400">Notes</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Generated Packets',        fv: String(f.generated),             sv: String(s.generated),             wv: String(w.generated),              dv: String(d.generated), note: 'Identical workload replayed for all 4 policies' },
              { label: 'Delivered Packets',        fv: String(f.delivered),             sv: String(s.delivered),             wv: String(w.delivered),              dv: String(d.delivered), note: 'Packets successfully transmitted across link' },
              { label: 'Dropped Packets',          fv: String(f.dropped),               sv: String(s.dropped),               wv: String(w.dropped),                dv: String(d.dropped), note: `${config.drop_policy} drops` },
              { label: 'Drop Rate',                fv: fmt(f.drop_rate_pct, '%'),       sv: fmt(s.drop_rate_pct, '%'),       wv: fmt(w.drop_rate_pct, '%'),        dv: fmt(d.drop_rate_pct, '%'), note: 'Fraction of generated packets lost' },
              { label: 'Throughput',               fv: fmt(f.throughput_mbps, 'Mbps'), sv: fmt(s.throughput_mbps, 'Mbps'), wv: fmt(w.throughput_mbps, 'Mbps'),   dv: fmt(d.throughput_mbps, 'Mbps'), note: 'Delivered bits over simulation time' },
              { label: 'Link Utilization',         fv: fmt(f.link_utilization_pct, '%'), sv: fmt(s.link_utilization_pct, '%'), wv: fmt(w.link_utilization_pct, '%'), dv: fmt(d.link_utilization_pct, '%'), note: 'Bottleneck busy time' },
              { label: 'Avg Queueing Delay',       fv: fmt(f.avg_queueing_delay_ms, 'ms'), sv: fmt(s.avg_queueing_delay_ms, 'ms'), wv: fmt(w.avg_queueing_delay_ms, 'ms'), dv: fmt(d.avg_queueing_delay_ms, 'ms'), note: 'Aggregate queue waiting time' },
              { label: 'Avg E2E Latency',          fv: fmt(f.avg_e2e_delay_ms, 'ms'),  sv: fmt(s.avg_e2e_delay_ms, 'ms'),  wv: fmt(w.avg_e2e_delay_ms, 'ms'),    dv: fmt(d.avg_e2e_delay_ms, 'ms'), note: 'Queue + Tx + Propagation delay' },
              { label: 'Peak Buffer Occupancy',    fv: `${f.max_queue_occupancy} pkts`, sv: `${s.max_queue_occupancy} pkts`, wv: `${w.max_queue_occupancy} pkts`, dv: `${d.max_queue_occupancy} pkts`, note: `Max queue depth (limit: ${config.buffer_limit})` },
            ].map(({ label, fv, sv, wv, dv, note }, i) => (
              <tr key={label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fv}</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-700">{sv}</td>
                <td className="px-4 py-2.5 text-right font-mono text-teal-700">{wv}</td>
                <td className="px-4 py-2.5 text-right font-mono text-rose-700">{dv}</td>
                <td className="px-4 py-2.5 text-gray-400 pl-5">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-2">
      <div>
        <p className="text-xs font-bold text-gray-800">{title}</p>
        <p className="text-[10px] text-gray-400">{subtitle}</p>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function PolicyRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-gray-500">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
