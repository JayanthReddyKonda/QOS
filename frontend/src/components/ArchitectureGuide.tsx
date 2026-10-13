export function ArchitectureGuide() {
  return (
    <div className="max-w-3xl space-y-8 text-sm text-gray-700 leading-relaxed">
      <div>
        <h2 className="text-2xl font-black text-gray-900 mb-1">Architecture & Algorithms Guide</h2>
        <p className="text-gray-500 text-xs">Computer Networks course project — QoS Traffic Manager</p>
      </div>

      <Section title="System Overview">
        <p>
          The simulation is a <strong>discrete-time tick-based model</strong> with 100 µs resolution.
          A synthetic packet workload is generated once using a seeded Poisson process, then replayed
          identically through three scheduling algorithms — guaranteeing a fair apples-to-apples comparison.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
          <li>Backend: Python · FastAPI WebSocket · tick-based simulator</li>
          <li>Frontend: React 18 · TypeScript · Tailwind CSS · Recharts</li>
          <li>Communication: WebSocket streaming — live progress, then chunked packet trace</li>
        </ul>
      </Section>

      <Section title="Traffic Classes">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">Class</th>
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">SPQ Priority</th>
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">WFQ Weight</th>
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">Packet Size</th>
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">BW Share</th>
              <th className="px-3 py-2 text-left font-semibold border border-gray-200">Real-world Example</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Voice',        '4 (highest)', 'w=4', '160 B (fixed)',   '5%',  'VoIP, real-time audio'],
              ['Video',        '3 (high)',    'w=3', '400–1400 B',      '25%', 'Video streaming, conferencing'],
              ['Web',          '2 (medium)',  'w=2', '200–1500 B',      '25%', 'HTTP/HTTPS web browsing'],
              ['File Transfer','1 (lowest)',  'w=1', '1000–1500 B',     '45%', 'FTP, backup, software updates'],
            ].map(([cls, pri, wfq, size, bw, ex], i) => (
              <tr key={cls} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                <td className="px-3 py-2 border border-gray-200 font-semibold">{cls}</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-violet-700">{pri}</td>
                <td className="px-3 py-2 border border-gray-200 font-mono text-teal-700">{wfq}</td>
                <td className="px-3 py-2 border border-gray-200 font-mono">{size}</td>
                <td className="px-3 py-2 border border-gray-200 font-mono">{bw}</td>
                <td className="px-3 py-2 border border-gray-200 text-gray-500">{ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="FIFO — First In, First Out (Baseline)">
        <p>
          All packets enter a single queue and are served in strict arrival order regardless of class.
          No packet gets preferential treatment. Under congestion, voice packets may wait behind
          large file-transfer packets, causing unacceptable delay for real-time applications.
        </p>
        <CodeBlock>{`Queue: [voice, file, file, video, web, file, voice, ...]
Service: FIFO — oldest packet always first
Tail-drop: reject on buffer_used >= buffer_limit`}</CodeBlock>
        <p className="mt-2"><strong>When to use:</strong> Trivially fair; suitable when all traffic has equal priority and delay tolerance.</p>
      </Section>

      <Section title="SPQ — Strict Priority Queuing">
        <p>
          Four separate queues (one per class) share a common buffer counter. When the link is free,
          the scheduler always picks the head-of-line packet from the highest-priority non-empty queue.
          <strong> Non-preemptive</strong> — an in-service packet is never interrupted.
        </p>
        <CodeBlock>{`queues = {4: deque(), 3: deque(), 2: deque(), 1: deque()}
def select_next():
    for priority in [4, 3, 2, 1]:          # voice first
        if queues[priority]:
            return queues[priority].popleft()

Guarantee: Voice always dequeued before any Video/Web/File
Trade-off: File transfer may starve under extreme congestion`}</CodeBlock>
        <p className="mt-2"><strong>Standard reference:</strong> RFC 4594 — Configuration Guidelines for DiffServ.</p>
      </Section>

      <Section title="WFQ — Weighted Fair Queuing (New)">
        <p>
          WFQ (also called Packet-by-Packet Generalised Processor Sharing — PGPS) assigns each class
          a <em>weight</em>. When the link is free, it picks the packet with the minimum
          <strong> virtual finish time (VFT)</strong> across all non-empty queues.
        </p>
        <CodeBlock>{`# Per-class virtual finish time (VFT) tracking
_vft = {cls: 0.0 for cls in classes}   # initialised to 0

def select_next(now_us):
    best_cls, best_vft = None, inf
    for cls in non_empty_queues:
        pkt   = queues[cls][0]             # head-of-line (don't pop)
        bits  = pkt.payload_bytes * 8
        w     = weights[cls]               # voice=4, video=3, web=2, file=1
        # VFT = max(last_finish_for_class, now) + bits/weight
        vft   = max(_vft[cls], now_us) + bits / w
        if vft < best_vft:
            best_vft, best_cls = vft, cls
    pkt = queues[best_cls].popleft()
    _vft[best_cls] = best_vft             # update for next packet in class
    return pkt`}</CodeBlock>
        <p className="mt-2">
          This guarantees each class receives bandwidth proportional to its weight over the long run.
          Voice (w=4) gets 4× the bandwidth of File (w=1) when both are backlogged.
          Unlike SPQ, WFQ never completely starves a lower-weight class.
        </p>
        <p className="mt-1"><strong>Standard reference:</strong> Demers, Keshav, Shenker — "Analysis and Simulation of a Fair Queuing Algorithm", SIGCOMM 1989.</p>
      </Section>

      <Section title="Simulation Architecture">
        <CodeBlock>{`WebSocket flow:
  client → {seed, load_profile, link_mbps, buffer_limit, ...}
  server → {type: 'workload_ready', total_packets: N}
  server → {type: 'tick', policy, progress, queue_lengths, ...}  ×many
  server → {type: 'policy_complete', policy, metrics}            ×3
  server → {type: 'packets_chunk', policy, packets: [...]}       ×many
  server → {type: 'results', fifo: {...}, spq: {...}, wfq: {...}}

Tick loop (100 µs resolution):
  1. Admit all packets with arrival_time_us <= sim_time_us
  2. scheduler.step(sim_time_us)   → deliver / start TX
  3. Every 500 ticks → send WebSocket snapshot
  4. Termination: arrivals done ∧ in_service=None ∧ queues empty`}</CodeBlock>
      </Section>

      <Section title="Key Metrics (Spec §12)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-3 py-2 text-left border border-gray-200">Metric</th>
                <th className="px-3 py-2 text-left border border-gray-200">Formula</th>
                <th className="px-3 py-2 text-left border border-gray-200">Unit</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Queueing Delay',   'tx_start_time − queue_entry_time',          'ms'],
                ['E2E Delay',        'delivery_time − arrival_time',               'ms'],
                ['Delay Variation',  'mean |Δ(e2e_delay_i+1 − e2e_delay_i)|',    'ms'],
                ['Throughput',       'Σ(delivered bits) / sim_duration_s',        'Mbps'],
                ['Link Utilization', 'link_busy_us / sim_duration_us × 100',      '%'],
                ['Drop Rate',        'dropped / generated × 100',                  '%'],
                ['Avg Occupancy',    'time-weighted mean of occupancy_series',     'pkts'],
              ].map(([m, f, u], i) => (
                <tr key={m} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 border border-gray-200 font-semibold">{m}</td>
                  <td className="px-3 py-2 border border-gray-200 font-mono text-gray-600">{f}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-500">{u}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>


    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-black text-gray-900 pb-1.5 border-b border-gray-200">{title}</h3>
      {children}
    </section>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs font-mono text-gray-700 overflow-x-auto leading-relaxed">
      {children}
    </pre>
  );
}
