from typing import List, Dict, Any, Optional
from .packet import Packet
import statistics


def compute_metrics(
    packets: List[Packet],
    sim_duration_us: int,
    link_busy_us: int,
    occupancy_series: List[tuple],
    link_mbps: float = 10.0,
    duration_ms: int = 5000,
) -> Dict[str, Any]:
    """Compute aggregate and per-class metrics per Section 12 of spec."""

    classes = ['voice', 'video', 'web', 'file']
    delivered = [p for p in packets if p.status == 'delivered']
    dropped_pkts = [p for p in packets if p.status == 'dropped']
    generated = len(packets)

    def class_packets(cls, lst):
        return [p for p in lst if p.traffic_class == cls]

    def safe_mean(lst):
        return statistics.mean(lst) if lst else None

    def delay_variation(pkts: List[Packet]) -> Optional[float]:
        """Mean absolute difference between successive E2E delays of delivered packets."""
        if len(pkts) < 2:
            return None
        sorted_pkts = sorted(pkts, key=lambda p: p.arrival_time_us)
        delays = [(p.delivery_time_us - p.arrival_time_us) / 1000.0 for p in sorted_pkts]  # ms
        diffs = [abs(delays[i + 1] - delays[i]) for i in range(len(delays) - 1)]
        return statistics.mean(diffs) if diffs else None

    # Time-weighted average queue occupancy
    def avg_occupancy(series: List[tuple]) -> float:
        if not series:
            return 0.0
        total_time = series[-1][0] - series[0][0] if len(series) > 1 else 1
        if total_time == 0:
            return float(series[0][1]) if series else 0.0
        weighted = sum(
            series[i][1] * (series[i + 1][0] - series[i][0])
            for i in range(len(series) - 1)
        )
        return weighted / total_time

    max_occupancy = max((s[1] for s in occupancy_series), default=0)

    # Simulation duration in seconds (includes drain phase)
    sim_duration_s = sim_duration_us / 1_000_000.0

    # Offered duration in seconds (the packet generation window)
    offered_duration_s = max(duration_ms / 1000.0, 0.001)

    # Offered load calculation
    total_offered_bits = sum(p.payload_bytes * 8.0 for p in packets)
    offered_load_mbps = (total_offered_bits / offered_duration_s) / 1_000_000.0
    offered_load_pct = (offered_load_mbps / link_mbps * 100.0) if link_mbps > 0 else 0.0

    # Delivered throughput
    agg_delivered_bits = sum(p.payload_bytes * 8.0 for p in delivered)
    agg_throughput = (agg_delivered_bits / sim_duration_s / 1_000_000.0) if sim_duration_s > 0 else 0.0

    def throughput_mbps(pkts: List[Packet]) -> float:
        if sim_duration_s == 0:
            return 0.0
        total_bits = sum(p.payload_bytes * 8.0 for p in pkts)
        return total_bits / sim_duration_s / 1_000_000.0

    # Link utilization
    utilization = (link_busy_us / sim_duration_us * 100.0) if sim_duration_us > 0 else 0.0
    utilization = min(100.0, max(0.0, utilization))

    # Delays for delivered packets
    agg_queueing_delays = [
        (p.tx_start_time_us - p.queue_entry_time_us) / 1000.0
        for p in delivered
        if p.tx_start_time_us is not None and p.queue_entry_time_us is not None
    ]
    agg_e2e_delays = [
        (p.delivery_time_us - p.arrival_time_us) / 1000.0
        for p in delivered
        if p.delivery_time_us is not None
    ]

    per_class = {}
    for cls in classes:
        cls_all = class_packets(cls, packets)
        cls_del = class_packets(cls, delivered)
        cls_drop = class_packets(cls, dropped_pkts)
        cls_gen = len(cls_all)

        cls_q_delays = [
            (p.tx_start_time_us - p.queue_entry_time_us) / 1000.0
            for p in cls_del
            if p.tx_start_time_us is not None and p.queue_entry_time_us is not None
        ]
        cls_e2e_delays = [
            (p.delivery_time_us - p.arrival_time_us) / 1000.0
            for p in cls_del
            if p.delivery_time_us is not None
        ]

        cls_offered_bits = sum(p.payload_bytes * 8.0 for p in cls_all)
        cls_offered_mbps = (cls_offered_bits / offered_duration_s) / 1_000_000.0

        per_class[cls] = {
            'generated': cls_gen,
            'delivered': len(cls_del),
            'dropped': len(cls_drop),
            'drop_rate_pct': (len(cls_drop) / cls_gen * 100.0) if cls_gen > 0 else 0.0,
            'delivery_ratio_pct': (len(cls_del) / cls_gen * 100.0) if cls_gen > 0 else 0.0,
            'avg_queueing_delay_ms': safe_mean(cls_q_delays),
            'avg_e2e_delay_ms': safe_mean(cls_e2e_delays),
            'delay_variation_ms': delay_variation(cls_del),
            'throughput_mbps': throughput_mbps(cls_del),
            'offered_load_mbps': cls_offered_mbps,
        }

    # Downsampled occupancy series (up to 120 points) for chart rendering
    downsampled_occ = []
    if occupancy_series:
        step = max(1, len(occupancy_series) // 120)
        downsampled_occ = [
            {'time_ms': round(occupancy_series[i][0] / 1000.0, 1), 'occupancy': occupancy_series[i][1]}
            for i in range(0, len(occupancy_series), step)
        ]

    return {
        'generated': generated,
        'delivered': len(delivered),
        'dropped': len(dropped_pkts),
        'drop_rate_pct': (len(dropped_pkts) / generated * 100.0) if generated > 0 else 0.0,
        'delivery_ratio_pct': (len(delivered) / generated * 100.0) if generated > 0 else 0.0,
        'offered_load_mbps': offered_load_mbps,
        'offered_load_pct': offered_load_pct,
        'avg_queueing_delay_ms': safe_mean(agg_queueing_delays),
        'avg_e2e_delay_ms': safe_mean(agg_e2e_delays),
        'throughput_mbps': agg_throughput,
        'link_utilization_pct': utilization,
        'avg_queue_occupancy': avg_occupancy(occupancy_series),
        'max_queue_occupancy': max_occupancy,
        'sim_duration_ms': sim_duration_us / 1000.0,
        'occupancy_series': downsampled_occ,
        'per_class': per_class,
    }
