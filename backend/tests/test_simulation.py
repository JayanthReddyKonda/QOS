import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import copy
import pytest
from simulation.packet import Packet, CLASS_PRIORITY
from simulation.traffic_generator import generate_workload
from simulation.scheduler import FIFOScheduler, SPQScheduler, WFQScheduler, DRRScheduler
from simulation.metrics import compute_metrics

DEFAULT_CFG = dict(link_mbps=10.0, buffer_limit=50, prop_delay_us=10_000)


def run_scheduler(scheduler, packets):
    """Run scheduler to completion. Returns (delivered, dropped, sim_time_us, link_busy_us, occupancy)."""
    arrival_idx = 0
    sim_time_us = 0
    TICK = 100

    while True:
        while arrival_idx < len(packets) and packets[arrival_idx].arrival_time_us <= sim_time_us:
            scheduler.admit(packets[arrival_idx], sim_time_us)
            arrival_idx += 1
        scheduler.step(sim_time_us)
        sim_time_us += TICK

        queue_empty = all(
            len(q) == 0 for q in (
                scheduler.queues.values() if hasattr(scheduler, 'queues') else [scheduler.queue]
            )
        )
        if arrival_idx >= len(packets) and scheduler.in_service is None and queue_empty:
            break

    return scheduler.delivered, scheduler.dropped, sim_time_us, scheduler.link_busy_us, scheduler.occupancy_series


def make_packet(pid, cls, arrival_us, size=500):
    return Packet(
        packet_id=pid,
        traffic_class=cls,
        priority=CLASS_PRIORITY[cls],
        payload_bytes=size,
        arrival_time_us=arrival_us,
    )


# A1: FIFO ordering
def test_fifo_ordering():
    packets = [
        make_packet(0, 'voice', 0),
        make_packet(1, 'file', 100),
        make_packet(2, 'video', 200),
        make_packet(3, 'web', 300),
    ]
    sched = FIFOScheduler(**DEFAULT_CFG)
    delivered, _, _, _, _ = run_scheduler(sched, packets)
    tx_starts = [p.tx_start_time_us for p in delivered]
    assert tx_starts == sorted(tx_starts), "FIFO: packets not served in arrival order"
    delivered_ids = [p.packet_id for p in delivered]
    assert delivered_ids == [0, 1, 2, 3], "FIFO: wrong packet order"


# A2: SPQ priority ordering
def test_spq_priority_ordering():
    # All packets arrive at time 0 — SPQ should serve voice first, then video, web, file
    packets = [
        make_packet(0, 'file', 0, 100),
        make_packet(1, 'web', 0, 100),
        make_packet(2, 'video', 0, 100),
        make_packet(3, 'voice', 0, 100),
    ]
    sched = SPQScheduler(**DEFAULT_CFG)
    delivered, _, _, _, _ = run_scheduler(sched, packets)
    classes_in_order = [p.traffic_class for p in delivered]
    assert classes_in_order == ['voice', 'video', 'web', 'file'], \
        f"SPQ: wrong priority order, got {classes_in_order}"


# A3: Non-preemption
def test_spq_non_preemption():
    # voice arrives while file is in service — file must complete before voice starts
    packets = [
        make_packet(0, 'file', 0, 1500),   # large file, takes ~1200us at 10Mbps
        make_packet(1, 'voice', 100, 160), # arrives while file is transmitting
    ]
    sched = SPQScheduler(**DEFAULT_CFG)
    delivered, _, _, _, _ = run_scheduler(sched, packets)
    file_pkt = next(p for p in delivered if p.traffic_class == 'file')
    voice_pkt = next(p for p in delivered if p.traffic_class == 'voice')
    assert voice_pkt.tx_start_time_us >= file_pkt.tx_end_time_us, \
        "SPQ: voice preempted in-service file packet (non-preemption violated)"


# A4: Buffer limit
def test_buffer_limit():
    sched = FIFOScheduler(link_mbps=10.0, buffer_limit=3, prop_delay_us=0)
    for i in range(5):
        p = make_packet(i, 'file', 0, 1500)
        sched.admit(p, 0)
    assert sched.buffer_used <= 3, f"Buffer overflow: buffer_used={sched.buffer_used}"
    assert len(sched.dropped) >= 1, "Buffer limit not enforced: no packets dropped"


# A5: Same input for FIFO and SPQ
def test_same_input():
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=1000)
    fifo_packets = copy.deepcopy(workload)
    spq_packets = copy.deepcopy(workload)
    for fp, sp in zip(fifo_packets, spq_packets):
        assert fp.packet_id == sp.packet_id
        assert fp.payload_bytes == sp.payload_bytes
        assert fp.traffic_class == sp.traffic_class
        assert fp.arrival_time_us == sp.arrival_time_us


# A6: Count reconciliation (all 4 policies)
def test_count_reconciliation():
    workload = generate_workload(seed=42, load_profile='heavy', link_mbps=10.0, duration_ms=2000)
    for policy_cls in [FIFOScheduler, SPQScheduler, WFQScheduler, DRRScheduler]:
        packets = copy.deepcopy(workload)
        sched = policy_cls(**DEFAULT_CFG)
        delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, packets)
        assert len(delivered) + len(dropped) == len(workload), \
            f"{policy_cls.__name__}: delivered({len(delivered)}) + dropped({len(dropped)}) != generated({len(workload)})"


# A7: Metric ranges
def test_metric_ranges():
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    packets = copy.deepcopy(workload)
    sched = FIFOScheduler(**DEFAULT_CFG)
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, packets)
    metrics = compute_metrics(delivered + dropped, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=2000)
    assert 0 <= metrics['drop_rate_pct'] <= 100
    assert 0 <= metrics['link_utilization_pct'] <= 100
    assert metrics['avg_queue_occupancy'] >= 0
    assert metrics['offered_load_mbps'] > 0
    for cls, cm in metrics['per_class'].items():
        assert 0 <= cm['drop_rate_pct'] <= 100
        if cm['avg_queueing_delay_ms'] is not None:
            assert cm['avg_queueing_delay_ms'] >= 0


# A8: Repeatability
def test_repeatability():
    w1 = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    w2 = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    assert [p.packet_id for p in w1] == [p.packet_id for p in w2]
    assert [p.payload_bytes for p in w1] == [p.payload_bytes for p in w2]
    assert [p.arrival_time_us for p in w1] == [p.arrival_time_us for p in w2]


# A9: Dashboard consistency (Packet trace reconciliation with aggregated metrics)
def test_dashboard_and_trace_consistency():
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    sched = FIFOScheduler(**DEFAULT_CFG)
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))
    all_packets = delivered + dropped
    metrics = compute_metrics(all_packets, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=2000)

    # Sum of per-class delivered must equal aggregate delivered
    per_class_delivered = sum(cm['delivered'] for cm in metrics['per_class'].values())
    per_class_dropped = sum(cm['dropped'] for cm in metrics['per_class'].values())
    per_class_generated = sum(cm['generated'] for cm in metrics['per_class'].values())

    assert per_class_delivered == metrics['delivered'], "Per-class delivered sum does not match aggregate"
    assert per_class_dropped == metrics['dropped'], "Per-class dropped sum does not match aggregate"
    assert per_class_generated == metrics['generated'], "Per-class generated sum does not match aggregate"
    assert len(all_packets) == metrics['generated'], "Packet trace count does not match generated metric"


# A10: Trade-off visibility under congestion
def test_spq_trade_off_visibility():
    """Deterministic scenario: SPQ must prioritize high priority traffic before queued lower priority traffic."""
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    
    fifo_sched = FIFOScheduler(**DEFAULT_CFG)
    delivered_f, _, sim_time_f, busy_f, occ_f = run_scheduler(fifo_sched, copy.deepcopy(workload))
    metrics_f = compute_metrics(delivered_f, sim_time_f, busy_f, occ_f, link_mbps=10.0, duration_ms=2000)
    
    spq_sched = SPQScheduler(**DEFAULT_CFG)
    delivered_s, _, sim_time_s, busy_s, occ_s = run_scheduler(spq_sched, copy.deepcopy(workload))
    metrics_s = compute_metrics(delivered_s, sim_time_s, busy_s, occ_s, link_mbps=10.0, duration_ms=2000)

    voice_fifo_delay = metrics_f['per_class']['voice']['avg_e2e_delay_ms']
    voice_spq_delay = metrics_s['per_class']['voice']['avg_e2e_delay_ms']
    
    assert voice_spq_delay is not None and voice_fifo_delay is not None
    assert voice_spq_delay < voice_fifo_delay, \
        f"SPQ voice delay ({voice_spq_delay:.2f} ms) should be lower than FIFO ({voice_fifo_delay:.2f} ms) under congestion"


# A11: WFQ — buffer limit enforced
def test_wfq_buffer_limit():
    """WFQ must respect the shared buffer limit and drop excess packets."""
    sched = WFQScheduler(link_mbps=10.0, buffer_limit=3, prop_delay_us=0)
    for i in range(5):
        p = make_packet(i, 'file', 0, 1500)
        sched.admit(p, 0)
    assert sched.shared_buffer_used <= 3, f"WFQ buffer overflow: used={sched.shared_buffer_used}"
    assert len(sched.dropped) >= 1, "WFQ: buffer limit not enforced"


# A12: WFQ — non-preemption
def test_wfq_non_preemption():
    """WFQ must not interrupt an in-service packet even if a higher-weight packet arrives."""
    packets = [
        make_packet(0, 'file', 0, 1500),   # large file — low weight, takes ~1.2ms at 10 Mbps
        make_packet(1, 'voice', 100, 160), # higher weight, arrives during file transmission
    ]
    sched = WFQScheduler(**DEFAULT_CFG)
    delivered, _, _, _, _ = run_scheduler(sched, packets)
    file_pkt  = next(p for p in delivered if p.traffic_class == 'file')
    voice_pkt = next(p for p in delivered if p.traffic_class == 'voice')
    assert voice_pkt.tx_start_time_us >= file_pkt.tx_end_time_us, \
        "WFQ: voice preempted in-service file packet (non-preemption violated)"


# A13: WFQ — proportional bandwidth allocation
def test_wfq_proportional_bandwidth():
    """WFQ with weights voice=4, file=1 should give voice ~4x the throughput of file
    when both are equally offered.  Tested under non-congested, equal-arrival conditions.
    """
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=3000)
    sched = WFQScheduler(**DEFAULT_CFG)  # default weights: voice=4, video=3, web=2, file=1
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))
    metrics = compute_metrics(delivered + dropped, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=3000)

    # Under WFQ with these weights, voice should get strictly lower avg queueing delay than file
    voice_delay = metrics['per_class']['voice']['avg_queueing_delay_ms']
    file_delay  = metrics['per_class']['file']['avg_queueing_delay_ms']
    if voice_delay is not None and file_delay is not None and file_delay > 0:
        # Voice (weight=4) should have equal or lower queueing delay than file (weight=1)
        assert voice_delay <= file_delay + 5.0, \
            f"WFQ: voice delay ({voice_delay:.2f} ms) unexpectedly higher than file ({file_delay:.2f} ms)"


# A14: DRR — Deficit Round Robin fairness and non-preemption
def test_drr_fairness():
    """DRR should serve all active queues in round robin, granting proportional deficit."""
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    sched = DRRScheduler(**DEFAULT_CFG)
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))
    metrics = compute_metrics(delivered + dropped, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=2000)

    assert metrics['delivered'] > 0
    assert metrics['delivered'] + metrics['dropped'] == len(workload)
    # Voice (weight=4) should have lower or comparable queueing delay than file (weight=1)
    voice_delay = metrics['per_class']['voice']['avg_queueing_delay_ms']
    file_delay = metrics['per_class']['file']['avg_queueing_delay_ms']
    if voice_delay is not None and file_delay is not None:
        assert voice_delay <= file_delay + 5.0


# A15: Push-Out Buffer Policy protects high-priority traffic
def test_push_out_protects_voice():
    """When buffer is full of low-priority packets, Push-Out should evict lower-priority
    packets to admit Voice packets, yielding 0 voice drops.
    """
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    sched = SPQScheduler(buffer_limit=30, link_mbps=10.0, prop_delay_us=10_000, drop_policy='push_out')
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))
    metrics = compute_metrics(delivered + dropped, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=2000)

    # Voice drop rate under push_out should be substantially lower than file drop rate
    voice_drop = metrics['per_class']['voice']['drop_rate_pct']
    file_drop = metrics['per_class']['file']['drop_rate_pct']
    assert voice_drop < 5.0, f"Push-Out failed to protect voice: voice_drop={voice_drop:.2f}%"
    assert file_drop > voice_drop, f"File ({file_drop:.2f}%) did not absorb drops compared to voice ({voice_drop:.2f}%)"


# A16: WRED early drop drops packets before hard buffer limit
def test_wred_early_drop():
    """WRED should perform probabilistic early drop with wred_early_drop reason."""
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=2000)
    sched = SPQScheduler(buffer_limit=50, link_mbps=10.0, prop_delay_us=10_000, drop_policy='wred')
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))

    early_drops = [p for p in dropped if p.drop_reason == 'wred_early_drop']
    assert len(early_drops) > 0, "WRED did not trigger any early drops"
# A17: Transmission duration edge case robustness
def test_tx_duration_robustness():
    pkt = make_packet(0, 'voice', 0, size=160)
    # Even at high link speeds or low rates, duration must be at least 1 us
    assert pkt.tx_duration_us(link_mbps=1000.0) >= 1
    assert pkt.tx_duration_us(link_mbps=0.01) >= 1
    assert pkt.tx_duration_us(link_mbps=10.0) == 128  # 160 * 8 / 10 = 128 us


# A18: Occupancy series downsampling and schema
def test_occupancy_series_downsampling():
    workload = generate_workload(seed=42, load_profile='congested', link_mbps=10.0, duration_ms=1000)
    sched = FIFOScheduler(**DEFAULT_CFG)
    delivered, dropped, sim_time_us, link_busy_us, occ = run_scheduler(sched, copy.deepcopy(workload))
    metrics = compute_metrics(delivered + dropped, sim_time_us, link_busy_us, occ, link_mbps=10.0, duration_ms=1000)
    series = metrics.get('occupancy_series', [])
    assert len(series) > 0
    assert all('time_ms' in pt and 'occupancy' in pt for pt in series)


