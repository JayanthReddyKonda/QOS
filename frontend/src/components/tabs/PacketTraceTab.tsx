import { useState } from 'react';
import type { SimResults, PolicyType, TrafficClass, PacketRecord } from '../../types/simulation';
import { CLASS_COLORS, CLASS_LABELS, POLICY_COLORS } from '../../types/simulation';

const POLICIES: PolicyType[] = ['fifo', 'spq', 'wfq'];
const PAGE_SIZE = 50;

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function PacketTraceTab({ results }: { results: SimResults }) {
  const [policy, setPolicy] = useState<PolicyType>('fifo');
  const [filterClass, setFilterClass] = useState<TrafficClass | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'delivered' | 'dropped'>('all');
  const [page, setPage] = useState(0);

  const allPackets = results[`packets_${policy}`] as PacketRecord[];
  const filtered = allPackets.filter((p) => {
    if (filterClass !== 'all' && p.traffic_class !== filterClass) return false;
    if (filterStatus === 'delivered' && p.status !== 'delivered') return false;
    if (filterStatus === 'dropped'   && p.status !== 'dropped')   return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const page_pkts  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportAll = () => {
    const headers = ['Policy','Pkt ID','Class','Priority','Size (B)','Arrival (µs)',
                     'Queue Entry (µs)','TX Start (µs)','TX End (µs)','Delivery (µs)','Status','Drop Reason'];
    const rows: string[][] = [headers];
    for (const pol of POLICIES) {
      for (const p of results[`packets_${pol}`] as PacketRecord[]) {
        rows.push([
          pol.toUpperCase(), String(p.packet_id), p.traffic_class, String(p.priority),
          String(p.payload_bytes), String(p.arrival_time_us),
          String(p.queue_entry_time_us ?? ''), String(p.tx_start_time_us ?? ''),
          String(p.tx_end_time_us ?? ''), String(p.delivery_time_us ?? ''),
          p.status, p.drop_reason ?? '',
        ]);
      }
    }
    downloadCsv('qos_packet_trace.csv', rows);
  };

  const polColor = POLICY_COLORS[policy];

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="pb-2 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900">Packet Trace Log</h2>
          <p className="text-xs text-gray-500 mt-1">Individual packet lifecycle — arrival → queue → transmit → deliver/drop</p>
        </div>
        <button
          onClick={exportAll}
          className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          ↓ Export All CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Policy selector */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {POLICIES.map((pol) => (
            <button
              key={pol}
              onClick={() => { setPolicy(pol); setPage(0); }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer
                ${policy === pol ? 'bg-white shadow text-gray-900 border border-gray-200' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {pol.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Class filter */}
        <select
          value={filterClass}
          onChange={(e) => { setFilterClass(e.target.value as TrafficClass | 'all'); setPage(0); }}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none"
        >
          <option value="all">All Classes</option>
          {(['voice','video','web','file'] as TrafficClass[]).map((c) => (
            <option key={c} value={c}>{CLASS_LABELS[c]}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setPage(0); }}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="delivered">Delivered</option>
          <option value="dropped">Dropped</option>
        </select>

        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length.toLocaleString()} packets (of {allPackets.length.toLocaleString()})
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              {['ID','Class','Size','Arrival (µs)','Queue Entry (µs)','TX Start (µs)','TX End (µs)','E2E Delay (ms)','Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page_pkts.map((p, i) => {
              const e2e = p.delivery_time_us != null ? ((p.delivery_time_us - p.arrival_time_us) / 1000).toFixed(2) : null;
              const isDropped = p.status === 'dropped';
              return (
                <tr key={p.packet_id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${isDropped ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 font-mono text-gray-600">{p.packet_id}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CLASS_COLORS[p.traffic_class] }} />
                      <span className="capitalize text-gray-700">{p.traffic_class}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">{p.payload_bytes} B</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{p.arrival_time_us}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{p.queue_entry_time_us ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{p.tx_start_time_us ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{p.tx_end_time_us ?? '—'}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-gray-700">{e2e != null ? `${e2e} ms` : '—'}</td>
                  <td className="px-3 py-2">
                    {isDropped ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        DROPPED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                        DELIVERED
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {page_pkts.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No packets match the selected filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            ← Previous
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Summary stats for selected policy */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['voice','video','web','file'] as TrafficClass[]).map((cls) => {
          const pkts = allPackets.filter((p) => p.traffic_class === cls);
          const delivered = pkts.filter((p) => p.status === 'delivered');
          return (
            <div key={cls} className="card p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
                <span className="text-xs font-bold text-gray-700 capitalize">{cls}</span>
              </div>
              <div className="text-lg font-black font-mono" style={{ color: polColor }}>
                {pkts.length > 0 ? `${(delivered.length / pkts.length * 100).toFixed(1)}%` : '—'}
              </div>
              <div className="text-[10px] text-gray-400">delivery ratio</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {delivered.length} / {pkts.length} delivered
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
