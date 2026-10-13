import type { SimResults, TrafficClass, PolicyType } from '../../types/simulation';
import { CLASS_COLORS, CLASS_LABELS, POLICY_COLORS } from '../../types/simulation';

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

export function QueueTab({ results }: { results: SimResults }) {
  const policies: PolicyType[] = ['fifo', 'spq', 'wfq', 'drr'];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="pb-2 border-b border-gray-200">
        <h2 className="text-xl font-black text-gray-900">Queue & Buffer Analysis</h2>
        <p className="text-xs text-gray-500 mt-1">
          Detailed inspection of shared buffer utilization and per-class queue occupancy across all 4 schedulers.
        </p>
      </div>

      {/* Per-policy queue summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {policies.map((pol) => {
          const m = results[pol];
          const dotColor = pol === 'fifo' ? 'bg-blue-500' : pol === 'spq' ? 'bg-violet-500' : pol === 'wfq' ? 'bg-teal-500' : 'bg-rose-500';
          const headerColor = pol === 'fifo' ? 'text-blue-700 border-blue-200 bg-blue-50'
                            : pol === 'spq'  ? 'text-violet-700 border-violet-200 bg-violet-50'
                            : pol === 'wfq'  ? 'text-teal-700 border-teal-200 bg-teal-50'
                            : 'text-rose-700 border-rose-200 bg-rose-50';
          return (
            <div key={pol} className="card overflow-hidden">
              <div className={`px-4 py-3 border-b flex items-center gap-2 ${headerColor}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                <span className="text-sm font-black uppercase">{pol}</span>
                <span className="ml-auto text-xs font-mono">
                  peak {m.max_queue_occupancy} pkts
                </span>
              </div>

              {/* Buffer fill bar */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Peak buffer fill</span>
                  <span className="font-mono">{m.max_queue_occupancy} pkts</span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                  <div
                    className={`h-full rounded-full ${pol === 'fifo' ? 'bg-blue-500' : pol === 'spq' ? 'bg-violet-500' : pol === 'wfq' ? 'bg-teal-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, (m.max_queue_occupancy / Math.max(...policies.map(p => results[p].max_queue_occupancy || 1))) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Per-class breakdown */}
              <div className="px-4 py-3 space-y-3">
                {CLASSES.map((cls) => {
                  const cm = m.per_class[cls];
                  const fillPct = cm.generated > 0 ? (cm.delivered / cm.generated) * 100 : 0;
                  return (
                    <div key={cls}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
                          <span className="font-medium text-gray-700">{CLASS_LABELS[cls]}</span>
                        </span>
                        <span className="font-mono text-gray-500 text-[11px]">
                          {cm.delivered}/{cm.generated}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${fillPct}%`, background: CLASS_COLORS[cls] }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Drop: {cm.dropped} ({cm.drop_rate_pct.toFixed(1)}%)</span>
                        <span>Q: {cm.avg_queueing_delay_ms != null ? `${cm.avg_queueing_delay_ms.toFixed(1)}ms` : '0ms'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cross-policy class comparison table */}
      <div className="card overflow-x-auto">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800">Drop Distribution by Class Across Schedulers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Dropped packet counts and loss rates across all 4 algorithms</p>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="px-4 py-2.5 text-left font-semibold">Class</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.fifo }}>FIFO Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.spq }}>SPQ Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.wfq }}>WFQ Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.drr }}>DRR Drops</th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((cls, i) => {
              const fd = results.fifo.per_class[cls];
              const sd = results.spq.per_class[cls];
              const wd = results.wfq.per_class[cls];
              const dd = results.drr.per_class[cls];
              return (
                <tr key={cls} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
                      <span className="font-semibold text-gray-700">{CLASS_LABELS[cls]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fd.dropped} ({fd.drop_rate_pct.toFixed(1)}%)</td>
                  <td className="px-4 py-2.5 text-right font-mono text-violet-700">{sd.dropped} ({sd.drop_rate_pct.toFixed(1)}%)</td>
                  <td className="px-4 py-2.5 text-right font-mono text-teal-700">{wd.dropped} ({wd.drop_rate_pct.toFixed(1)}%)</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-700">{dd.dropped} ({dd.drop_rate_pct.toFixed(1)}%)</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
