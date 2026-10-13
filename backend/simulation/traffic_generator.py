import random
from typing import List
from .packet import Packet, CLASS_PRIORITY

# Target offered load ratio relative to link transmission capacity (Spec Section 17)
LOAD_TARGET_RATIOS = {
    'low': 0.50,            # Scenario A: ~50% of link capacity
    'near_capacity': 0.95,  # Scenario B: ~90-100% of link capacity
    'congested': 1.30,      # Scenario C: ~130% of link capacity
    'heavy': 1.70,          # Scenario D: ~170% of link capacity
}

# Traffic class bandwidth proportions (sum to 1.0)
CLASS_BW_SHARE = {
    'voice': 0.05,  # Priority 4: small volume, delay-sensitive interactive voice
    'video': 0.25,  # Priority 3: medium volume, video streaming
    'web': 0.25,    # Priority 2: web traffic
    'file': 0.45,   # Priority 1: bulk background data transfer
}

# Packet payload size ranges in bytes: (min, max). Voice is fixed at 160.
PACKET_SIZE_RANGES = {
    'voice': (160, 160),
    'video': (400, 1400),
    'web': (200, 1500),
    'file': (1000, 1500),
}

AVG_PACKET_BYTES = {
    'voice': 160,
    'video': 900,
    'web': 850,
    'file': 1250,
}


def generate_workload(
    seed: int,
    load_profile: str,
    link_mbps: float,
    duration_ms: int,
) -> List[Packet]:
    """Generate all packets for the simulation, sorted by arrival_time_us.
    
    The offered load is calibrated relative to link capacity according to
    the experiment matrix in Spec Section 17.
    Reused via deepcopy for both FIFO and SPQ (Acceptance Checklist A5, A8).
    """
    rng = random.Random(seed)
    ratio = LOAD_TARGET_RATIOS.get(load_profile, 1.0)
    target_bps = ratio * link_mbps * 1_000_000.0

    packets: List[Packet] = []
    pid = 0
    duration_us = duration_ms * 1000

    for cls in ['voice', 'video', 'web', 'file']:
        cls_bps = target_bps * CLASS_BW_SHARE[cls]
        avg_bits = AVG_PACKET_BYTES[cls] * 8.0
        pkt_rate = cls_bps / avg_bits  # packets per second
        mean_ia_ms = 1000.0 / pkt_rate
        s_min, s_max = PACKET_SIZE_RANGES[cls]

        t_us = 0
        while t_us < duration_us:
            # Poisson arrivals with mean inter-arrival time
            ia_ms = rng.expovariate(1.0 / mean_ia_ms)
            t_us += int(ia_ms * 1000)
            if t_us >= duration_us:
                break
            size = rng.randint(s_min, s_max)
            pkt = Packet(
                packet_id=pid,
                traffic_class=cls,
                priority=CLASS_PRIORITY[cls],
                payload_bytes=size,
                arrival_time_us=t_us,
            )
            packets.append(pkt)
            pid += 1

    # Sort all packets by arrival time
    packets.sort(key=lambda p: p.arrival_time_us)
    # Reassign sequential IDs after sort
    for i, p in enumerate(packets):
        p.packet_id = i

    return packets
