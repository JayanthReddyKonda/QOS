import copy
import asyncio
from typing import List, Dict, Any
from fastapi import WebSocket
from .packet import Packet
from .traffic_generator import generate_workload
from .scheduler import FIFOScheduler, SPQScheduler, WFQScheduler, DRRScheduler
from .metrics import compute_metrics

TICK_US = 100            # 100 µs tick resolution
EMIT_EVERY_N_TICKS = 500 # WebSocket update every 500 ticks = 50 ms simulated time
PACKET_CHUNK_SIZE = 500  # Packet records streamed in batches to avoid oversized WS frames


async def run_simulation(config: dict, websocket: WebSocket):
    """Run FIFO, SPQ, WFQ, and DRR on the same workload with chosen drop_policy, streaming events over WebSocket."""
    seed          = int(config['seed'])
    load_profile  = str(config['load_profile'])
    link_mbps     = float(config['link_mbps'])
    buffer_limit  = int(config['buffer_limit'])
    prop_delay_ms = float(config['prop_delay_ms'])
    duration_ms   = int(config['duration_ms'])
    drop_policy   = str(config.get('drop_policy', 'tail_drop'))

    prop_delay_us = int(prop_delay_ms * 1000)

    # ── Generate workload once; all policies use identical deepcopies ──
    workload = generate_workload(seed, load_profile, link_mbps, duration_ms)
    await websocket.send_json({
        'type': 'workload_ready',
        'total_packets': len(workload),
    })

    results: Dict[str, Any] = {}
    all_packets: Dict[str, List[dict]] = {}

    policies = ['fifo', 'spq', 'wfq', 'drr']

    for policy in policies:
        packets: List[Packet] = copy.deepcopy(workload)

        if policy == 'fifo':
            scheduler = FIFOScheduler(buffer_limit, link_mbps, prop_delay_us, drop_policy=drop_policy)
        elif policy == 'spq':
            scheduler = SPQScheduler(buffer_limit, link_mbps, prop_delay_us, drop_policy=drop_policy)
        elif policy == 'wfq':
            scheduler = WFQScheduler(buffer_limit, link_mbps, prop_delay_us, drop_policy=drop_policy)
        else:
            scheduler = DRRScheduler(buffer_limit, link_mbps, prop_delay_us, drop_policy=drop_policy)

        arrival_idx    = 0
        sim_time_us    = 0
        tick_count     = 0
        buffered_events: List[Dict] = []

        # ── Main simulation loop ──────────────────────────────────────────
        while True:
            # Admit every packet whose arrival time has been reached
            while arrival_idx < len(packets) and packets[arrival_idx].arrival_time_us <= sim_time_us:
                admitted = scheduler.admit(packets[arrival_idx], sim_time_us)
                buffered_events.append({
                    'event': 'admitted' if admitted else 'dropped',
                    'packet': packets[arrival_idx].to_dict(),
                })
                arrival_idx += 1

            # Advance scheduler by one tick
            step_events = scheduler.step(sim_time_us)
            buffered_events.extend(step_events)

            # Emit a WebSocket snapshot periodically or whenever an event fires
            if tick_count % EMIT_EVERY_N_TICKS == 0 or step_events:
                queue_lens   = scheduler.queue_lengths
                total_waiting = sum(queue_lens.values())

                if arrival_idx < len(packets):
                    progress = (arrival_idx / len(packets)) * 90.0
                else:
                    remaining = total_waiting + (1 if scheduler.in_service else 0)
                    progress  = 90.0 + (1.0 - remaining / max(1, len(packets))) * 10.0
                    progress  = min(99.0, progress)

                await websocket.send_json({
                    'type':         'tick',
                    'policy':       policy,
                    'sim_time_us':  sim_time_us,
                    'in_service':   scheduler.in_service.to_dict() if scheduler.in_service else None,
                    'queue_lengths': queue_lens,
                    'events':       buffered_events,
                    'progress':     round(progress, 1),
                })
                buffered_events = []
                await asyncio.sleep(0)  # yield to event loop so FastAPI stays responsive

            sim_time_us += TICK_US
            tick_count  += 1

            # Termination: arrivals done + link free + all queues empty
            queue_empty = all(
                len(q) == 0
                for q in (
                    scheduler.queues.values()
                    if hasattr(scheduler, 'queues')
                    else [scheduler.queue]
                )
            )
            if arrival_idx >= len(packets) and scheduler.in_service is None and queue_empty:
                break
        # ── End simulation loop ───────────────────────────────────────────

        sim_duration_us  = sim_time_us
        all_sim_packets  = scheduler.delivered + scheduler.dropped

        metrics = compute_metrics(
            all_sim_packets,
            sim_duration_us,
            scheduler.link_busy_us,
            scheduler.occupancy_series,
            link_mbps=link_mbps,
            duration_ms=duration_ms,
        )

        results[policy]     = metrics
        all_packets[policy] = [p.to_dict() for p in all_sim_packets]

        await websocket.send_json({
            'type':    'policy_complete',
            'policy':  policy,
            'metrics': metrics,
        })

    # ── Stream packet trace in chunks (avoids oversized WS frames) ───────
    for policy in policies:
        pkt_list = all_packets[policy]
        for i in range(0, max(1, len(pkt_list)), PACKET_CHUNK_SIZE):
            chunk = pkt_list[i : i + PACKET_CHUNK_SIZE]
            await websocket.send_json({
                'type':    'packets_chunk',
                'policy':  policy,
                'offset':  i,
                'total':   len(pkt_list),
                'packets': chunk,
            })
            await asyncio.sleep(0)

    # ── Final results message (metrics only — packets already streamed) ───
    await websocket.send_json({
        'type': 'results',
        'fifo': results.get('fifo', {}),
        'spq':  results.get('spq',  {}),
        'wfq':  results.get('wfq',  {}),
        'drr':  results.get('drr',  {}),
    })
