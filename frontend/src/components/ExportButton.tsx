import type { SimResults } from '../types/simulation';

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ results }: { results: SimResults | null }) {
  if (!results) return null;

  const exportSummary = () => {
    const classes = ['voice', 'video', 'web', 'file'] as const;
    const headers = ['Class', 'Policy', 'Generated', 'Delivered', 'Dropped',
      'Drop Rate %', 'Delivery Ratio %', 'Avg Queue Delay ms', 'Avg E2E Delay ms',
      'Delay Variation ms', 'Throughput Mbps'];
    const rows: string[][] = [headers];
    for (const cls of classes) {
      for (const pol of ['fifo', 'spq', 'wfq', 'drr'] as const) {
        const m = results[pol].per_class[cls];
        rows.push([cls, pol.toUpperCase(), String(m.generated), String(m.delivered),
          String(m.dropped), m.drop_rate_pct.toFixed(2), m.delivery_ratio_pct.toFixed(2),
          m.avg_queueing_delay_ms?.toFixed(3) ?? 'N/A',
          m.avg_e2e_delay_ms?.toFixed(3) ?? 'N/A',
          m.delay_variation_ms?.toFixed(3) ?? 'N/A',
          m.throughput_mbps.toFixed(4)]);
      }
    }
    downloadCsv('qos_summary.csv', rows);
  };

  return (
    <button
      onClick={exportSummary}
      className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
    >
      ↓ Export CSV
    </button>
  );
}
