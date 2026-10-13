export type TrafficClass = 'voice' | 'video' | 'web' | 'file';
export type PolicyType = 'fifo' | 'spq' | 'wfq' | 'drr';
export type DropPolicy = 'tail_drop' | 'push_out' | 'wred';

export type SimStatus =
  | 'idle'
  | 'connecting'
  | 'running_fifo'
  | 'running_spq'
  | 'running_wfq'
  | 'running_drr'
  | 'complete'
  | 'error';

export interface SimConfig {
  seed: number;
  load_profile: 'low' | 'near_capacity' | 'congested' | 'heavy';
  link_mbps: number;
  buffer_limit: number;
  prop_delay_ms: number;
  duration_ms: number;
  drop_policy: DropPolicy;
}

export interface PacketRecord {
  packet_id: number;
  traffic_class: TrafficClass;
  priority: number;
  payload_bytes: number;
  arrival_time_us: number;
  queue_entry_time_us: number | null;
  tx_start_time_us: number | null;
  tx_end_time_us: number | null;
  delivery_time_us: number | null;
  status: 'in_queue' | 'in_service' | 'delivered' | 'dropped';
  drop_reason: string | null;
}

export interface ClassMetrics {
  generated: number;
  delivered: number;
  dropped: number;
  drop_rate_pct: number;
  delivery_ratio_pct: number;
  avg_queueing_delay_ms: number | null;
  avg_e2e_delay_ms: number | null;
  delay_variation_ms: number | null;
  throughput_mbps: number;
  offered_load_mbps?: number;
}

export interface OccupancyPoint {
  time_ms: number;
  occupancy: number;
}

export interface SimMetrics {
  generated: number;
  delivered: number;
  dropped: number;
  drop_rate_pct: number;
  delivery_ratio_pct: number;
  offered_load_mbps: number;
  offered_load_pct: number;
  avg_queueing_delay_ms: number | null;
  avg_e2e_delay_ms: number | null;
  throughput_mbps: number;
  link_utilization_pct: number;
  avg_queue_occupancy: number;
  max_queue_occupancy: number;
  sim_duration_ms: number;
  occupancy_series?: OccupancyPoint[];
  per_class: Record<TrafficClass, ClassMetrics>;
}

export interface SimResults {
  fifo: SimMetrics;
  spq: SimMetrics;
  wfq: SimMetrics;
  drr: SimMetrics;
  packets_fifo: PacketRecord[];
  packets_spq: PacketRecord[];
  packets_wfq: PacketRecord[];
  packets_drr: PacketRecord[];
}

export interface QueueSnapshot {
  sim_time_us: number;
  policy: PolicyType;
  queue_lengths: Record<TrafficClass, number>;
  in_service: PacketRecord | null;
}

// ── Colour palette (academic, non-neon) ──────────────────────────────────────
export const CLASS_COLORS: Record<TrafficClass, string> = {
  voice: '#16a34a', // green-600
  video: '#2563eb', // blue-600
  web:   '#d97706', // amber-600
  file:  '#6b7280', // gray-500
};

export const CLASS_LABELS: Record<TrafficClass, string> = {
  voice: 'Voice (VoIP)',
  video: 'Video Stream',
  web:   'Web Browsing',
  file:  'Bulk File Transfer',
};

export const CLASS_DESCRIPTIONS: Record<TrafficClass, string> = {
  voice: 'Fixed 160-byte audio packets, Poisson arrivals. Highly delay-sensitive.',
  video: '400–1400 byte video frames, bursty arrivals. Delay-tolerant but jitter-sensitive.',
  web:   '200–1500 byte request/response transactions. Moderate delay tolerance.',
  file:  '1000–1500 byte bulk data. High delay-tolerance, elastic transfer.',
};

export const CLASS_PRIORITY: Record<TrafficClass, number> = {
  voice: 4,
  video: 3,
  web:   2,
  file:  1,
};

// Default weights (voice=4, video=3, web=2, file=1)
export const WFQ_WEIGHTS: Record<TrafficClass, number> = {
  voice: 4,
  video: 3,
  web:   2,
  file:  1,
};

export const DRR_QUANTUMS: Record<TrafficClass, number> = {
  voice: 2000,
  video: 1500,
  web:   1000,
  file:  500,
};

export const POLICY_COLORS: Record<PolicyType, string> = {
  fifo: '#2563eb',  // blue-600
  spq:  '#7c3aed',  // violet-600
  wfq:  '#0d9488',  // teal-600
  drr:  '#e11d48',  // rose-600
};

export const POLICY_LABELS: Record<PolicyType, string> = {
  fifo: 'FIFO (Baseline)',
  spq:  'Strict Priority (SPQ)',
  wfq:  'Weighted Fair Queuing (WFQ)',
  drr:  'Deficit Round Robin (DRR)',
};

export const LOAD_PROFILE_LABELS: Record<string, string> = {
  low:           'A — Low Load (~50% capacity)',
  near_capacity: 'B — Near Capacity (~95% capacity)',
  congested:     'C — Congested (~130% capacity)',
  heavy:         'D — Heavy Congestion (~170% capacity)',
};

export const LOAD_PROFILE_DETAILS: Record<string, { label: string; desc: string; color: string }> = {
  low: {
    label: 'Low Load (~50%)',
    desc: 'Plenty of headroom. Queues idle; all schedulers behave identically.',
    color: 'text-green-700 bg-green-50 border-green-200',
  },
  near_capacity: {
    label: 'Near Capacity (~95%)',
    desc: 'Traffic approaches link limit. Brief transient queues form during bursts.',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  congested: {
    label: 'Congested (~130%)',
    desc: 'Demand exceeds capacity. QoS schedulers protect real-time latency.',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  heavy: {
    label: 'Heavy Congestion (~170%)',
    desc: 'Severe bottleneck. Buffer overflows, tail-drops dominate unless Push-Out or WRED is active.',
    color: 'text-red-700 bg-red-50 border-red-200',
  },
};

export const DROP_POLICY_LABELS: Record<DropPolicy, string> = {
  tail_drop: 'Tail-Drop (Standard Shared Buffer)',
  push_out:  'Push-Out (Priority Eviction)',
  wred:      'WRED (Weighted Early Detection)',
};

export const DROP_POLICY_DESCRIPTIONS: Record<DropPolicy, string> = {
  tail_drop: 'Class-blind: drops incoming packets whenever buffer reaches limit. All classes experience similar drop rates (~28–30%).',
  push_out:  'Priority eviction: when buffer is full and Voice arrives, waiting File packets are pushed out. Voice drop rate drops to 0.0%.',
  wred:      'Probabilistic early discard: sheds bulk file traffic before buffer saturates, preventing bufferbloat and protecting real-time voice.',
};
