import type { SimResults, TrafficClass } from '../../types/simulation';
import { CLASS_COLORS, CLASS_LABELS, CLASS_DESCRIPTIONS, CLASS_PRIORITY, POLICY_COLORS } from '../../types/simulation';

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

const METRICS = [
  { key: 'generated',            label: 'Generated',         unit: 'pkts',   d: 0, better: null },
  { key: 'delivered',            label: 'Delivered',         unit: 'pkts',   d: 0, better: 'higher' },
  { key: 'dropped',              label: 'Dropped',           unit: 'pkts',   d: 0, better: 'lower' },
  { key: 'drop_rate_pct',        label: 'Drop Rate',         unit: '%',      d: 2, better: 'lower' },
  { key: 'delivery_ratio_pct',   label: 'Delivery Ratio',    unit: '%',      d: 2, better: 'higher' },
  { key: 'avg_queueing_delay_ms',label: 'Avg Queue Delay',   unit: 'ms',     d: 2, better: 'lower' },
  { key: 'avg_e2e_delay_ms',     label: 'Avg E2E Delay',     unit: 'ms',     d: 2, better: 'lower' },
  { key: 'delay_variation_ms',   label: 'Delay Variation',   unit: 'ms',     d: 2, better: 'lower' },
  { key: 'throughput_mbps',      label: 'Throughput',        unit: 'Mbps',   d: 3, better: 'higher' },
] as const;

export function ComparisonTab({ results }: { results: SimResults }) {
  return (
    <div className="space-y-8 max-w-6xl">
      <div className="pb-2 border-b border-gray-200">
        <h2 className="text-xl font-black text-gray-900">Per-Class Metrics Comparison</h2>
        <p className="text-xs text-gray-500 mt-1">
          Same packet workload, all three schedulers. Green = best value for that metric.
        </p>
      </div>

      {CLASSES.map((cls) => {
        const priority = CLASS_PRIORITY[cls];
        return (
          <div key={cls} className="card overflow-x-auto">
            {/* Class header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CLASS_COLORS[cls] }} />
              <div>
                <span className="font-bold text-gray-900 text-sm">{CLASS_LABELS[cls]}</span>
                <span className="ml-2 text-xs text-gray-400">SPQ Priority {priority}</span>
                {cls === 'voice' || cls === 'video' ? (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-semibold">Delay-sensitive</span>
                ) : (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-500 font-semibold">Delay-tolerant</span>
                )}
              </div>
              <p className="ml-auto text-xs text-gray-400 hidden sm:block">{CLASS_DESCRIPTIONS[cls]}</p>
            </div>

            {/* Metrics table */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="px-4 py-2 text-left font-semibold">Metric</th>
                  <th className="px-4 py-2 text-right font-semibold" style={{ color: POLICY_COLORS.fifo }}>FIFO</th>
                  <th className="px-4 py-2 text-right font-semibold" style={{ color: POLICY_COLORS.spq }}>SPQ</th>
                  <th className="px-4 py-2 text-right font-semibold" style={{ color: POLICY_COLORS.wfq }}>WFQ</th>
                  <th className="px-4 py-2 text-left pl-5 font-semibold text-gray-400">Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map(({ key, label, unit, d, better }, i) => {
                  const fv = results.fifo.per_class[cls][key as keyof typeof results.fifo.per_class[typeof cls]];
                  const sv = results.spq.per_class[cls][key as keyof typeof results.spq.per_class[typeof cls]];
                  const wv = results.wfq.per_class[cls][key as keyof typeof results.wfq.per_class[typeof cls]];

                  const vals = [
                    { pol: 'fifo', v: typeof fv === 'number' ? fv : null },
                    { pol: 'spq',  v: typeof sv === 'number' ? sv : null },
                    { pol: 'wfq',  v: typeof wv === 'number' ? wv : null },
                  ];

                  const numeric = vals.filter(x => x.v != null).map(x => x.v as number);
                  const best = numeric.length > 0
                    ? (better === 'lower' ? Math.min(...numeric) : better === 'higher' ? Math.max(...numeric) : null)
                    : null;

                  const isBest = (v: number | null) => best !== null && v === best;

                  const interpretation = buildInterpretation(cls, key as string, fv, sv, wv);

                  return (
                    <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2 text-gray-600 font-medium">{label}</td>
                      {vals.map(({ pol, v }) => (
                        <td key={pol} className={`px-4 py-2 text-right font-mono font-semibold
                          ${isBest(v) && better ? 'text-green-700 font-bold' : 'text-gray-700'}`}
                        >
                          {v == null ? 'N/A' : `${v.toFixed(d)} ${unit}`}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-gray-400 pl-5">{interpretation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function buildInterpretation(
  cls: TrafficClass,
  key: string,
  fv: unknown, sv: unknown, wv: unknown,
): string {
  const fn = typeof fv === 'number' ? fv : null;
  const sn = typeof sv === 'number' ? sv : null;
  const wn = typeof wv === 'number' ? wv : null;

  if (key === 'avg_e2e_delay_ms' && fn != null && sn != null && wn != null) {
    if (cls === 'voice' || cls === 'video') {
      const spqGain = fn > 0 ? ((fn - sn) / fn * 100).toFixed(0) : 0;
      const wfqGain = fn > 0 ? ((fn - wn) / fn * 100).toFixed(0) : 0;
      return `SPQ: ${spqGain}% lower than FIFO · WFQ: ${wfqGain}% lower`;
    }
    if (cls === 'file') {
      return 'File waits longer under SPQ/WFQ — trades delay for voice/video quality';
    }
  }
  if (key === 'drop_rate_pct' && fn != null && sn != null && wn != null) {
    if (sn < fn) return 'SPQ / WFQ prioritize this class away from drops';
    if (sn > fn) return 'Higher-priority classes use buffer first under SPQ';
    return 'Drop rate unchanged across schedulers';
  }
  if (key === 'throughput_mbps' && fn != null && sn != null) {
    const diff = Math.abs(sn - fn);
    if (diff < 0.01) return 'Throughput unchanged — scheduling only reorders, not adds bandwidth';
    return `${sn > fn ? 'SPQ delivers more' : 'SPQ delivers less'} bits for this class`;
  }
  return '';
}
