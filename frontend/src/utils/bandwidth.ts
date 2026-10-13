import type { SimResults, TrafficClass, PolicyType } from '../types/simulation';

export interface BandwidthTimePoint {
  timeMs: number;
  timeSec: number;
  voice: number;
  video: number;
  web: number;
  file: number;
  total: number;
}

export interface ClassBandwidthSummary {
  trafficClass: TrafficClass;
  offeredMbps: number;
  deliveredMbps: number;
  droppedMbps: number;
  deliveryEfficiencyPct: number;
  linkSharePct: number; // Share of total link capacity
  throughputSharePct: number; // Share of total delivered throughput
}

export interface PolicyBandwidthAnalysis {
  policy: PolicyType;
  linkCapacityMbps: number;
  totalOfferedMbps: number;
  totalDeliveredMbps: number;
  totalDroppedMbps: number;
  linkUtilizationPct: number;
  oversubscriptionPct: number;
  classes: Record<TrafficClass, ClassBandwidthSummary>;
  timeline: BandwidthTimePoint[];
}

const CLASSES: TrafficClass[] = ['voice', 'video', 'web', 'file'];

/**
 * Computes time-binned delivered bandwidth (in Mbps) for each traffic class across the simulation.
 * Uses delivered packets' transmission windows.
 */
export function computeBandwidthTimeline(
  results: SimResults,
  policy: PolicyType,
  bucketSizeMs = 100
): BandwidthTimePoint[] {
  const packets = results[`packets_${policy}`];
  if (!packets || packets.length === 0) return [];

  // Find max time from delivered packets
  const deliveredPkts = packets.filter((p) => p.status === 'delivered' && p.tx_end_time_us !== null);
  if (deliveredPkts.length === 0) return [];

  const maxTimeUs = Math.max(...deliveredPkts.map((p) => p.tx_end_time_us!));
  const totalBuckets = Math.max(1, Math.min(300, Math.ceil((maxTimeUs / 1000) / bucketSizeMs)));
  const bucketUs = bucketSizeMs * 1000;

  // Initialize buckets
  const buckets: Record<TrafficClass, number[]> = {
    voice: new Array(totalBuckets).fill(0),
    video: new Array(totalBuckets).fill(0),
    web: new Array(totalBuckets).fill(0),
    file: new Array(totalBuckets).fill(0),
  };

  // Populate bytes into buckets based on tx_start_time_us or arrival_time_us
  for (const pkt of deliveredPkts) {
    const tUs = pkt.tx_start_time_us ?? pkt.arrival_time_us;
    const bucketIdx = Math.min(totalBuckets - 1, Math.floor(tUs / bucketUs));
    if (bucketIdx >= 0) {
      buckets[pkt.traffic_class][bucketIdx] += pkt.payload_bytes * 8; // bits
    }
  }

  const bucketDurationSec = bucketSizeMs / 1000.0;
  const result: BandwidthTimePoint[] = [];

  for (let i = 0; i < totalBuckets; i++) {
    const timeMs = i * bucketSizeMs;
    const voice = (buckets.voice[i] / bucketDurationSec) / 1_000_000.0;
    const video = (buckets.video[i] / bucketDurationSec) / 1_000_000.0;
    const web = (buckets.web[i] / bucketDurationSec) / 1_000_000.0;
    const file = (buckets.file[i] / bucketDurationSec) / 1_000_000.0;
    const total = voice + video + web + file;

    result.push({
      timeMs,
      timeSec: +(timeMs / 1000).toFixed(2),
      voice: +voice.toFixed(3),
      video: +video.toFixed(3),
      web: +web.toFixed(3),
      file: +file.toFixed(3),
      total: +total.toFixed(3),
    });
  }

  return result;
}

/**
 * Computes deep bandwidth utilization and efficiency metrics for a given policy.
 */
export function analyzePolicyBandwidth(
  results: SimResults,
  policy: PolicyType,
  linkCapacityMbps: number,
  durationMs: number
): PolicyBandwidthAnalysis {
  const metrics = results[policy];
  const packets = results[`packets_${policy}`];
  const durationSec = Math.max(0.001, durationMs / 1000.0);

  const classesSummary = {} as Record<TrafficClass, ClassBandwidthSummary>;

  let sumDroppedMbps = 0;

  for (const cls of CLASSES) {
    const cm = metrics.per_class[cls];
    const offeredMbps = cm.offered_load_mbps ?? 0;
    const deliveredMbps = cm.throughput_mbps;

    // Dropped bits calculation from dropped packets
    const droppedPkts = packets.filter((p) => p.traffic_class === cls && p.status === 'dropped');
    const droppedBits = droppedPkts.reduce((sum, p) => sum + p.payload_bytes * 8, 0);
    const droppedMbps = (droppedBits / durationSec) / 1_000_000.0;
    sumDroppedMbps += droppedMbps;

    const deliveryEfficiency = offeredMbps > 0
      ? Math.min(100, Math.max(0, (deliveredMbps / offeredMbps) * 100))
      : 100;

    const linkSharePct = linkCapacityMbps > 0
      ? (deliveredMbps / linkCapacityMbps) * 100
      : 0;

    const throughputSharePct = metrics.throughput_mbps > 0
      ? (deliveredMbps / metrics.throughput_mbps) * 100
      : 0;

    classesSummary[cls] = {
      trafficClass: cls,
      offeredMbps: +offeredMbps.toFixed(3),
      deliveredMbps: +deliveredMbps.toFixed(3),
      droppedMbps: +droppedMbps.toFixed(3),
      deliveryEfficiencyPct: +deliveryEfficiency.toFixed(1),
      linkSharePct: +linkSharePct.toFixed(1),
      throughputSharePct: +throughputSharePct.toFixed(1),
    };
  }

  const timeline = computeBandwidthTimeline(results, policy, 100);

  return {
    policy,
    linkCapacityMbps,
    totalOfferedMbps: +metrics.offered_load_mbps.toFixed(3),
    totalDeliveredMbps: +metrics.throughput_mbps.toFixed(3),
    totalDroppedMbps: +sumDroppedMbps.toFixed(3),
    linkUtilizationPct: +metrics.link_utilization_pct.toFixed(1),
    oversubscriptionPct: +metrics.offered_load_pct.toFixed(1),
    classes: classesSummary,
    timeline,
  };
}
