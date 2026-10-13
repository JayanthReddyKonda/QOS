import type { SimResults, TrafficClass, PolicyType } from '../../types/simulation';
import { CLASS_COLORS, CLASS_LABELS, POLICY_COLORS } from '../../types/simulation';

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

export function QueueTab({ results }: { results: SimResults }) {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="pb-2 border-b border-gray-200">
        <h2 className="text-xl font-black text-gray-900">Queue & Buffer Analysis</h2>
        <p className="text-xs text-gray-500 mt-1">
          How the shared buffer was utilised by each traffic class under each scheduling policy.
        </p>
      </div>

      {/* Per-policy queue summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {(['fifo', 'spq', 'wfq'] as PolicyType[]).map((pol) => {
          const m = results[pol];
          const dotColor = pol === 'fifo' ? 'bg-blue-500' : pol === 'spq' ? 'bg-violet-500' : 'bg-teal-500';
          const headerColor = pol === 'fifo' ? 'text-blue-700 border-blue-200 bg-blue-50'
                            : pol === 'spq'  ? 'text-violet-700 border-violet-200 bg-violet-50'
                                             : 'text-teal-700 border-teal-200 bg-teal-50';
          return (
            <div key={pol} className="card overflow-hidden">
              <div className={`px-4 py-3 border-b flex items-center gap-2 ${headerColor}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                <span className="text-sm font-black uppercase">{pol}</span>
                <span className="ml-auto text-xs font-mono">
                  max {m.max_queue_occupancy} / avg {m.avg_queue_occupancy.toFixed(1)} pkts
                </span>
              </div>

              {/* Buffer fill bar */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Peak buffer fill</span>
                  <span className="font-mono">{m.max_queue_occupancy} pkts</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                  <div
                    className={`h-full rounded-full ${pol === 'fifo' ? 'bg-blue-400' : pol === 'spq' ? 'bg-violet-400' : 'bg-teal-400'}`}
                    style={{ width: `${Math.min(100, (m.max_queue_occupancy / Math.max(...(['fifo','spq','wfq'] as PolicyType[]).map(p => results[p].max_queue_occupancy))) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Per-class breakdown */}
              <div className="px-4 py-3 space-y-3">
                {CLASSES.map((cls) => {
                  const cm = m.per_class[cls];
                  const fillPct = cm.generated > 0 ? cm.delivered / cm.generated * 100 : 0;
                  return (
                    <div key={cls}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
                          <span className="font-medium text-gray-700">{CLASS_LABELS[cls]}</span>
                        </span>
                        <span className="font-mono text-gray-500">
                          {cm.delivered}/{cm.generated} ({fillPct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${fillPct}%`, background: CLASS_COLORS[cls] }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Drop: {cm.dropped} ({cm.drop_rate_pct.toFixed(1)}%)</span>
                        <span>Q delay: {cm.avg_queueing_delay_ms != null ? `${cm.avg_queueing_delay_ms.toFixed(1)} ms` : 'N/A'}</span>
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
          <h3 className="text-sm font-bold text-gray-800">Drop Distribution by Class × Policy</h3>
          <p className="text-xs text-gray-400 mt-0.5">How drops are distributed across traffic classes under each scheduler</p>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="px-4 py-2.5 text-left font-semibold">Class</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.fifo }}>FIFO Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.spq }}>SPQ Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold" style={{ color: POLICY_COLORS.wfq }}>WFQ Drops</th>
              <th className="px-4 py-2.5 text-right font-semibold">Avg Queue Delay (SPQ vs WFQ)</th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((cls, i) => {
              const fd = results.fifo.per_class[cls];
              const sd = results.spq.per_class[cls];
              const wd = results.wfq.per_class[cls];
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
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                    {sd.avg_queueing_delay_ms != null ? `${sd.avg_queueing_delay_ms.toFixed(1)} ms` : 'N/A'} /
                    {' '}{wd.avg_queueing_delay_ms != null ? `${wd.avg_queueing_delay_ms.toFixed(1)} ms` : 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Insight box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-gray-700">
        <strong className="text-amber-800">Buffer Dynamics:</strong>{' '}
        Under congestion, both SPQ and WFQ concentrate drops on <em>file transfer</em> (lowest priority / lowest weight).
        FIFO distributes drops randomly across all classes — voice and video take hits proportional to their packet count.
        WFQ provides a middle ground: proportional bandwidth allocation without totally starving any class.
      </div>
    </div>
  );
}
