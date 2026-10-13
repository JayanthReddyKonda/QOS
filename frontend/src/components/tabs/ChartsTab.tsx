import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { SimResults, TrafficClass, PolicyType, QueueSnapshot, SimConfig } from '../../types/simulation';
import { POLICY_COLORS, CLASS_COLORS, CLASS_LABELS } from '../../types/simulation';
import { computeBandwidthTimeline } from '../../utils/bandwidth';

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

interface Props {
  results: SimResults;
  snapshots?: Record<PolicyType, QueueSnapshot[]>;
  config?: SimConfig;
}

/**
 * Normalizes occupancy series across all 4 policies into synchronized uniform time bins.
 * Uses binary search to evaluate exact step-function occupancy at each sample timestamp.
 */
function alignOccupancySeries(results: SimResults, numSamples = 100) {
  const getSeries = (pol: PolicyType) => results[pol]?.occupancy_series ?? [];
  const sFifo = getSeries('fifo');
  const sSpq  = getSeries('spq');
  const sWfq  = getSeries('wfq');
  const sDrr  = getSeries('drr');

  const maxT = Math.max(
    sFifo[sFifo.length - 1]?.time_ms ?? 0,
    sSpq[sSpq.length - 1]?.time_ms ?? 0,
    sWfq[sWfq.length - 1]?.time_ms ?? 0,
    sDrr[sDrr.length - 1]?.time_ms ?? 0,
    1
  );

  const step = maxT / numSamples;
  const sampleTimes = Array.from({ length: numSamples + 1 }, (_, i) => +(i * step).toFixed(1));

  function queryOccupancy(series: Array<{ time_ms: number; occupancy: number }>, targetT: number): number {
    if (series.length === 0) return 0;
    let low = 0;
    let high = series.length - 1;
    let best = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (series[mid].time_ms <= targetT) {
        best = series[mid].occupancy;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  return sampleTimes.map((t) => ({
    t,
    FIFO: queryOccupancy(sFifo, t),
    SPQ:  queryOccupancy(sSpq, t),
    WFQ:  queryOccupancy(sWfq, t),
    DRR:  queryOccupancy(sDrr, t),
  }));
}

export function ChartsTab({ results, config }: Props) {
  const [selectedBwPolicy, setSelectedBwPolicy] = useState<PolicyType>('spq');

  // ── Synchronized Occupancy Data ───────────────────────────────────────────
  const occData = useMemo(() => alignOccupancySeries(results, 100), [results]);

  // ── Time-binned Bandwidth Timeline ────────────────────────────────────────
  const bwTimelineData = useMemo(() => {
    return computeBandwidthTimeline(results, selectedBwPolicy, 100);
  }, [results, selectedBwPolicy]);

  // ── Per-class E2E delay comparison ──────────────────────────────────────────
  const delayData = CLASSES.map((cls) => ({
    name: CLASS_LABELS[cls],
    FIFO: +(results.fifo.per_class[cls].avg_e2e_delay_ms ?? 0).toFixed(2),
    SPQ:  +(results.spq.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
    WFQ:  +(results.wfq.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
    DRR:  +(results.drr.per_class[cls].avg_e2e_delay_ms  ?? 0).toFixed(2),
  }));

  // ── Per-class drop rate comparison ──────────────────────────────────────────
  const dropData = CLASSES.map((cls) => ({
    name: CLASS_LABELS[cls],
    FIFO: +results.fifo.per_class[cls].drop_rate_pct.toFixed(2),
    SPQ:  +results.spq.per_class[cls].drop_rate_pct.toFixed(2),
    WFQ:  +results.wfq.per_class[cls].drop_rate_pct.toFixed(2),
    DRR:  +results.drr.per_class[cls].drop_rate_pct.toFixed(2),
  }));

  // ── Throughput per class ──────────────────────────────────────────────────
  const tputData = CLASSES.map((cls) => ({
    name: CLASS_LABELS[cls],
    FIFO: +results.fifo.per_class[cls].throughput_mbps.toFixed(3),
    SPQ:  +results.spq.per_class[cls].throughput_mbps.toFixed(3),
    WFQ:  +results.wfq.per_class[cls].throughput_mbps.toFixed(3),
    DRR:  +results.drr.per_class[cls].throughput_mbps.toFixed(3),
  }));

  // ── Offered Load vs Delivered Throughput by Class ─────────────────────────
  const offeredVsDeliveredData = CLASSES.map((cls) => ({
    name: CLASS_LABELS[cls],
    Offered: +(results.fifo.per_class[cls].offered_load_mbps ?? 0).toFixed(3),
    FIFO:    +results.fifo.per_class[cls].throughput_mbps.toFixed(3),
    SPQ:     +results.spq.per_class[cls].throughput_mbps.toFixed(3),
    WFQ:     +results.wfq.per_class[cls].throughput_mbps.toFixed(3),
    DRR:     +results.drr.per_class[cls].throughput_mbps.toFixed(3),
  }));

  const linkCapacity = config?.link_mbps ?? 10.0;
  const tooltipStyle = {
    fontSize: 11,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#111827',
  };

  const policies: PolicyType[] = ['fifo', 'spq', 'wfq', 'drr'];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="pb-2 border-b border-gray-200">
        <h2 className="text-xl font-black text-gray-900">Performance & Bandwidth Analytics</h2>
        <p className="text-xs text-gray-500 mt-1">
          Empirical evaluation of latency, loss distribution, link occupancy, and dynamic bandwidth allocation across all 4 schedulers.
        </p>
      </div>

      {/* ── Bandwidth Utilization by Class Over Time (Stacked Area Chart) ────── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Dynamic Bandwidth Allocation Over Simulated Time</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Time-binned throughput (100 ms intervals) per traffic class relative to the {linkCapacity} Mbps bottleneck capacity.
            </p>
          </div>
          {/* Policy Toggle */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {policies.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedBwPolicy(p)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  selectedBwPolicy === p
                    ? 'bg-white shadow text-gray-900 border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={bwTimelineData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="timeSec" tick={{ fontSize: 10 }} unit="s" />
            <YAxis tick={{ fontSize: 11 }} unit=" Mbps" />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: any) => [`${(+v).toFixed(3)} Mbps`]}
              labelFormatter={(l) => `Simulated Time: ${l}s`}
            />
            <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
            {linkCapacity > 0 && (
              <ReferenceLine
                y={linkCapacity}
                stroke="#dc2626"
                strokeDasharray="4 4"
                label={{
                  value: `Bottleneck Limit (${linkCapacity} Mbps)`,
                  fill: '#dc2626',
                  fontSize: 10,
                  position: 'top',
                }}
              />
            )}
            <Area type="monotone" dataKey="voice" name="Voice (Pri 4)" stackId="1" stroke={CLASS_COLORS.voice} fill={CLASS_COLORS.voice} fillOpacity={0.65} />
            <Area type="monotone" dataKey="video" name="Video (Pri 3)" stackId="1" stroke={CLASS_COLORS.video} fill={CLASS_COLORS.video} fillOpacity={0.65} />
            <Area type="monotone" dataKey="web"   name="Web (Pri 2)"   stackId="1" stroke={CLASS_COLORS.web}   fill={CLASS_COLORS.web}   fillOpacity={0.65} />
            <Area type="monotone" dataKey="file"  name="File (Pri 1)"  stackId="1" stroke={CLASS_COLORS.file}  fill={CLASS_COLORS.file}  fillOpacity={0.65} />
          </AreaChart>
        </ResponsiveContainer>

        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <div>
            <strong>Active View:</strong> {selectedBwPolicy.toUpperCase()} · Delivered Throughput: {results[selectedBwPolicy].throughput_mbps.toFixed(2)} Mbps ({results[selectedBwPolicy].link_utilization_pct.toFixed(1)}% link utilization)
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLORS.voice }} /> Voice</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLORS.video }} /> Video</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLORS.web }} /> Web</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLORS.file }} /> File Transfer</span>
          </div>
        </div>
      </div>

      {/* ── Row 1: Delay + Drop rate ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Avg E2E Delay per Class" subtitle="Lower is better for interactive real-time communications">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={delayData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" ms" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ms`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3, 3, 0, 0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Packet Drop Rate per Class" subtitle="Under Push-Out, Voice drops 0%; under Tail-Drop, loss is shared">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dropData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" %" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3, 3, 0, 0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 2: Throughput + Synchronized Queue Occupancy ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Delivered Throughput per Class" subtitle="Proportional bandwidth distribution among backlogged queues">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tputData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" Mbps" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} Mbps`]} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="FIFO" fill={POLICY_COLORS.fifo} radius={[3, 3, 0, 0]} />
              <Bar dataKey="SPQ"  fill={POLICY_COLORS.spq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="WFQ"  fill={POLICY_COLORS.wfq}  radius={[3, 3, 0, 0]} />
              <Bar dataKey="DRR"  fill={POLICY_COLORS.drr}  radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Queue Occupancy Over Simulated Time" subtitle="Synchronized buffer depth trajectory across all 4 schedulers">
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

      {/* ── Row 3: Offered Load vs Delivered Throughput Comparison ───────────── */}
      <ChartCard
        title="Offered Traffic Load vs. Delivered Throughput by Class"
        subtitle="Comparing original traffic generation rate against actual service rate achieved by each policy"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={offeredVsDeliveredData} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit=" Mbps" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} Mbps`]} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Offered" fill="#9ca3af" radius={[3, 3, 0, 0]} />
            <Bar dataKey="FIFO"    fill={POLICY_COLORS.fifo} radius={[3, 3, 0, 0]} />
            <Bar dataKey="SPQ"     fill={POLICY_COLORS.spq}  radius={[3, 3, 0, 0]} />
            <Bar dataKey="WFQ"     fill={POLICY_COLORS.wfq}  radius={[3, 3, 0, 0]} />
            <Bar dataKey="DRR"     fill={POLICY_COLORS.drr}  radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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
