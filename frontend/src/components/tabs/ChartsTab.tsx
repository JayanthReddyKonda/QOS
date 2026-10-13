import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { SimResults, TrafficClass, PolicyType, QueueSnapshot } from '../../types/simulation';
import { POLICY_COLORS } from '../../types/simulation';

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

export function ChartsTab({ results }: {
  results: SimResults;
  snapshots?: Record<PolicyType, QueueSnapshot[]>;
}) {
  // ── Per-class E2E delay comparison ──────────────────────────────────────────
  const delayData = CLASSES.map((cls) => ({
    name: cls.charAt(0).toUpperCase() + cls.slice(1),
    FIFO: +(results.fifo.per_class[cls].avg_e2e_delay_ms ?? 0).toFixed(2),
    SPQ:  +(results.spq.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
    WFQ:  +(results.wfq.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
    DRR:  +(results.drr.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
  }));

  // ── Per-class drop rate comparison ──────────────────────────────────────────
  const dropData = CLASSES.map((cls) => ({
    name: cls.charAt(0).toUpperCase() + cls.slice(1),
    FIFO: +results.fifo.per_class[cls].drop_rate_pct.toFixed(2),
    SPQ:  +results.spq.per_class[cls].drop_rate_pct.toFixed(2),
    WFQ:  +results.wfq.per_class[cls].drop_rate_pct.toFixed(2),
    DRR:  +results.drr.per_class[cls].drop_rate_pct.toFixed(2),
  }));

  // ── Throughput per class ──────────────────────────────────────────────────
  const tputData = CLASSES.map((cls) => ({
    name: cls.charAt(0).toUpperCase() + cls.slice(1),
    FIFO: +results.fifo.per_class[cls].throughput_mbps.toFixed(3),
    SPQ:  +results.spq.per_class[cls].throughput_mbps.toFixed(3),
    WFQ:  +results.wfq.per_class[cls].throughput_mbps.toFixed(3),
    DRR:  +results.drr.per_class[cls].throughput_mbps.toFixed(3),
  }));

  // ── Queue occupancy over time ─────────────────────────────────────────────
  const occFifo = (results.fifo.occupancy_series ?? []).map((p) => ({
    t: p.time_ms, FIFO: p.occupancy,
  }));
  const occSpq  = (results.spq.occupancy_series ?? []).map((p) => ({
    t: p.time_ms, SPQ: p.occupancy,
  }));
  const occWfq  = (results.wfq.occupancy_series ?? []).map((p) => ({
    t: p.time_ms, WFQ: p.occupancy,
  }));
  const occDrr  = (results.drr.occupancy_series ?? []).map((p) => ({
    t: p.time_ms, DRR: p.occupancy,
  }));

  const occData = occFifo.map((f, i) => ({
    t:    f.t,
    FIFO: f.FIFO,
    SPQ:  occSpq[i]?.SPQ  ?? 0,
    WFQ:  occWfq[i]?.WFQ  ?? 0,
    DRR:  occDrr[i]?.DRR  ?? 0,
  }));

  const tooltipStyle = { fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="pb-2 border-b border-gray-200">
        <h2 className="text-xl font-black text-gray-900">Performance Charts</h2>
        <p className="text-xs text-gray-500 mt-1">Direct visual comparison across all 4 schedulers (FIFO, SPQ, WFQ, DRR).</p>
      </div>

      {/* Row 1: Delay + Drop rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Avg E2E Delay per Class" subtitle="Lower is better for interactive voice and video">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={delayData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" ms" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ms`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3,3,0,0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3,3,0,0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3,3,0,0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Packet Drop Rate per Class" subtitle="Under Push-Out, Voice drops 0%; under Tail-Drop, drops are class-blind">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dropData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" %" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3,3,0,0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3,3,0,0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3,3,0,0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Throughput + Queue occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Throughput per Class" subtitle="Proportional bandwidth distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tputData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" Mbps" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} Mbps`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3,3,0,0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3,3,0,0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3,3,0,0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Queue Occupancy Over Time" subtitle="Buffer depth dynamics across all 4 schedulers">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={occData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} unit="ms" tickFormatter={(v) => `${(+v).toFixed(0)}`} />
              <YAxis tick={{ fontSize: 11 }} unit=" pkts" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} pkts`]} labelFormatter={(l) => `t=${l}ms`} />
              <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="FIFO" stroke={POLICY_COLORS.fifo} dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="SPQ"  stroke={POLICY_COLORS.spq}  dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="WFQ"  stroke={POLICY_COLORS.wfq}  dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="DRR"  stroke={POLICY_COLORS.drr}  dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
