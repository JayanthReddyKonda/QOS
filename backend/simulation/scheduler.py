from collections import deque
import random
from typing import Optional, List, Dict, Any
from .packet import Packet, CLASS_PRIORITY

PRIORITY_TO_CLASS = {4: 'voice', 3: 'video', 2: 'web', 1: 'file'}
CLASS_ORDER_ASCENDING = ['file', 'web', 'video', 'voice']  # lowest to highest priority


def _wred_drop_check(
    traffic_class: str,
    buffer_used: int,
    buffer_limit: int,
    avg_q: float,
    rng: random.Random,
) -> bool:
    """Check if packet should be dropped under WRED based on average queue occupancy."""
    if buffer_used >= buffer_limit:
        return True  # hard tail drop if physical buffer exhausted

    wred_params = {
        'voice': (int(buffer_limit * 0.80), buffer_limit, 0.05),
        'video': (int(buffer_limit * 0.60), int(buffer_limit * 0.95), 0.25),
        'web':   (int(buffer_limit * 0.40), int(buffer_limit * 0.85), 0.50),
        'file':  (int(buffer_limit * 0.20), int(buffer_limit * 0.70), 0.80),
    }
    min_th, max_th, max_p = wred_params.get(traffic_class, (int(buffer_limit * 0.5), buffer_limit, 0.5))

    if avg_q < min_th:
        return False
    if avg_q >= max_th:
        return True

    # Linear interpolation between min_th and max_th
    p = max_p * (avg_q - min_th) / max(1, (max_th - min_th))
    return rng.random() < p


class FIFOScheduler:
    def __init__(
        self,
        buffer_limit: int,
        link_mbps: float,
        prop_delay_us: int,
        drop_policy: str = 'tail_drop',
    ):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.drop_policy = drop_policy
        self.queue: deque[Packet] = deque()
        self.buffer_used = 0  # packets waiting (excl. in-service)
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []
        self.tick_us = 100

        # WRED tracking
        self.avg_q = 0.0
        self.wq = 0.002
        self.rng = random.Random(42)

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Admit packet based on configured drop policy (tail_drop, push_out, wred)."""
        self.avg_q = (1.0 - self.wq) * self.avg_q + self.wq * self.buffer_used

        if self.drop_policy == 'wred':
            if _wred_drop_check(packet.traffic_class, self.buffer_used, self.buffer_limit, self.avg_q, self.rng):
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow' if self.buffer_used >= self.buffer_limit else 'wred_early_drop'
                self.dropped.append(packet)
                return False

        elif self.buffer_used >= self.buffer_limit:
            if self.drop_policy == 'push_out':
                # Find lowest-priority packet in queue to evict (from tail forward)
                victim_idx = None
                lowest_prio = packet.priority
                for idx in range(len(self.queue) - 1, -1, -1):
                    p = self.queue[idx]
                    if p.priority < lowest_prio:
                        lowest_prio = p.priority
                        victim_idx = idx
                        if lowest_prio == 1:
                            break  # lowest possible priority found
                if victim_idx is not None:
                    victim = self.queue[victim_idx]
                    del self.queue[victim_idx]
                    self.buffer_used -= 1
                    victim.status = 'dropped'
                    victim.drop_reason = 'push_out'
                    self.dropped.append(victim)
                else:
                    packet.status = 'dropped'
                    packet.drop_reason = 'buffer_overflow'
                    self.dropped.append(packet)
                    return False
            else:
                # Default tail drop
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow'
                self.dropped.append(packet)
                return False

        packet.status = 'in_queue'
        packet.queue_entry_time_us = sim_time_us
        self.queue.append(packet)
        self.buffer_used += 1
        return True

    def step(self, sim_time_us: int) -> List[Dict[str, Any]]:
        """Advance one tick. Returns list of events."""
        events = []

        # Complete in-service packet if done
        if self.in_service is not None and sim_time_us >= self.tx_end_time_us:
            pkt = self.in_service
            pkt.tx_end_time_us = self.tx_end_time_us
            pkt.delivery_time_us = self.tx_end_time_us + self.prop_delay_us
            pkt.status = 'delivered'
            self.delivered.append(pkt)
            events.append({'event': 'delivered', 'packet': pkt.to_dict()})
            self.in_service = None

        # Start new packet if link is free and queue non-empty
        if self.in_service is None and self.queue:
            pkt = self.queue.popleft()
            self.buffer_used -= 1
            pkt.status = 'in_service'
            pkt.tx_start_time_us = sim_time_us
            tx_dur = pkt.tx_duration_us(self.link_mbps)
            self.tx_end_time_us = sim_time_us + tx_dur
            self.link_busy_us += tx_dur
            self.in_service = pkt
            events.append({'event': 'tx_start', 'packet': pkt.to_dict()})

        self.occupancy_series.append((sim_time_us, self.buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        counts = {'voice': 0, 'video': 0, 'web': 0, 'file': 0}
        for p in self.queue:
            counts[p.traffic_class] += 1
        return counts


class SPQScheduler:
    """Strict Priority Queuing — non-preemptive, shared buffer."""
    PRIORITIES = [4, 3, 2, 1]  # highest first
    PRIORITY_TO_CLASS = {4: 'voice', 3: 'video', 2: 'web', 1: 'file'}

    def __init__(
        self,
        buffer_limit: int,
        link_mbps: float,
        prop_delay_us: int,
        drop_policy: str = 'tail_drop',
    ):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.drop_policy = drop_policy
        self.queues: Dict[int, deque[Packet]] = {p: deque() for p in self.PRIORITIES}
        self.shared_buffer_used = 0
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []

        self.avg_q = 0.0
        self.wq = 0.002
        self.rng = random.Random(42)

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Try to admit packet to the appropriate priority queue."""
        self.avg_q = (1.0 - self.wq) * self.avg_q + self.wq * self.shared_buffer_used

        if self.drop_policy == 'wred':
            if _wred_drop_check(packet.traffic_class, self.shared_buffer_used, self.buffer_limit, self.avg_q, self.rng):
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow' if self.shared_buffer_used >= self.buffer_limit else 'wred_early_drop'
                self.dropped.append(packet)
                return False

        elif self.shared_buffer_used >= self.buffer_limit:
            if self.drop_policy == 'push_out':
                evicted = False
                for p in sorted(self.PRIORITIES):  # 1, 2, 3, 4
                    if p < packet.priority and self.queues[p]:
                        victim = self.queues[p].pop()
                        self.shared_buffer_used -= 1
                        victim.status = 'dropped'
                        victim.drop_reason = 'push_out'
                        self.dropped.append(victim)
                        evicted = True
                        break
                if not evicted:
                    packet.status = 'dropped'
                    packet.drop_reason = 'buffer_overflow'
                    self.dropped.append(packet)
                    return False
            else:
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow'
                self.dropped.append(packet)
                return False

        packet.status = 'in_queue'
        packet.queue_entry_time_us = sim_time_us
        self.queues[packet.priority].append(packet)
        self.shared_buffer_used += 1
        return True

    def _select_next(self) -> Optional[Packet]:
        """Pick next packet: highest-priority non-empty queue."""
        for p in self.PRIORITIES:
            if self.queues[p]:
                return self.queues[p].popleft()
        return None

    def step(self, sim_time_us: int) -> List[Dict[str, Any]]:
        events = []

        # Complete in-service packet if done
        if self.in_service is not None and sim_time_us >= self.tx_end_time_us:
            pkt = self.in_service
            pkt.tx_end_time_us = self.tx_end_time_us
            pkt.delivery_time_us = self.tx_end_time_us + self.prop_delay_us
            pkt.status = 'delivered'
            self.delivered.append(pkt)
            events.append({'event': 'delivered', 'packet': pkt.to_dict()})
            self.in_service = None

        # Start next packet: highest-priority non-empty queue (non-preemptive)
        if self.in_service is None:
            pkt = self._select_next()
            if pkt is not None:
                self.shared_buffer_used -= 1
                pkt.status = 'in_service'
                pkt.tx_start_time_us = sim_time_us
                tx_dur = pkt.tx_duration_us(self.link_mbps)
                self.tx_end_time_us = sim_time_us + tx_dur
                self.link_busy_us += tx_dur
                self.in_service = pkt
                events.append({'event': 'tx_start', 'packet': pkt.to_dict()})

        self.occupancy_series.append((sim_time_us, self.shared_buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        cls_map = {4: 'voice', 3: 'video', 2: 'web', 1: 'file'}
        return {cls_map[p]: len(self.queues[p]) for p in self.PRIORITIES}


class WFQScheduler:
    """Weighted Fair Queuing (PGPS) — non-preemptive, shared buffer."""
    CLASSES = ['voice', 'video', 'web', 'file']
    DEFAULT_WEIGHTS = {'voice': 4, 'video': 3, 'web': 2, 'file': 1}

    def __init__(
        self,
        buffer_limit: int,
        link_mbps: float,
        prop_delay_us: int,
        weights: Optional[Dict[str, int]] = None,
        drop_policy: str = 'tail_drop',
    ):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.weights: Dict[str, int] = weights if weights is not None else dict(self.DEFAULT_WEIGHTS)
        self.drop_policy = drop_policy

        self.queues: Dict[str, deque[Packet]] = {cls: deque() for cls in self.CLASSES}
        self.shared_buffer_used = 0
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []
        self._vft: Dict[str, float] = {cls: 0.0 for cls in self.CLASSES}

        self.avg_q = 0.0
        self.wq = 0.002
        self.rng = random.Random(42)

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Try to enqueue packet. Tail-drop, push-out, or WRED based on drop_policy."""
        self.avg_q = (1.0 - self.wq) * self.avg_q + self.wq * self.shared_buffer_used

        if self.drop_policy == 'wred':
            if _wred_drop_check(packet.traffic_class, self.shared_buffer_used, self.buffer_limit, self.avg_q, self.rng):
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow' if self.shared_buffer_used >= self.buffer_limit else 'wred_early_drop'
                self.dropped.append(packet)
                return False

        elif self.shared_buffer_used >= self.buffer_limit:
            if self.drop_policy == 'push_out':
                evicted = False
                for low_cls in CLASS_ORDER_ASCENDING:
                    if CLASS_PRIORITY[low_cls] < packet.priority and self.queues[low_cls]:
                        victim = self.queues[low_cls].pop()
                        self.shared_buffer_used -= 1
                        victim.status = 'dropped'
                        victim.drop_reason = 'push_out'
                        self.dropped.append(victim)
                        evicted = True
                        break
                if not evicted:
                    packet.status = 'dropped'
                    packet.drop_reason = 'buffer_overflow'
                    self.dropped.append(packet)
                    return False
            else:
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow'
                self.dropped.append(packet)
                return False

        packet.status = 'in_queue'
        packet.queue_entry_time_us = sim_time_us
        self.queues[packet.traffic_class].append(packet)
        self.shared_buffer_used += 1
        return True

    def _select_next(self, now_us: int) -> Optional[Packet]:
        """Choose HOL packet with minimum virtual finish time across non-empty queues."""
        best_cls: Optional[str] = None
        best_vft: float = float('inf')

        for cls in self.CLASSES:
            if not self.queues[cls]:
                continue
            pkt = self.queues[cls][0]
            w = self.weights.get(cls, 1)
            pkt_bits = pkt.payload_bytes * 8.0
            vft = max(self._vft[cls], float(now_us)) + pkt_bits / w
            if vft < best_vft:
                best_vft = vft
                best_cls = cls

        if best_cls is None:
            return None

        pkt = self.queues[best_cls].popleft()
        self._vft[best_cls] = best_vft
        self.shared_buffer_used -= 1
        return pkt

    def step(self, sim_time_us: int) -> List[Dict[str, Any]]:
        events = []

        if self.in_service is not None and sim_time_us >= self.tx_end_time_us:
            pkt = self.in_service
            pkt.tx_end_time_us = self.tx_end_time_us
            pkt.delivery_time_us = self.tx_end_time_us + self.prop_delay_us
            pkt.status = 'delivered'
            self.delivered.append(pkt)
            events.append({'event': 'delivered', 'packet': pkt.to_dict()})
            self.in_service = None

        if self.in_service is None:
            pkt = self._select_next(sim_time_us)
            if pkt is not None:
                pkt.status = 'in_service'
                pkt.tx_start_time_us = sim_time_us
                tx_dur = pkt.tx_duration_us(self.link_mbps)
                self.tx_end_time_us = sim_time_us + tx_dur
                self.link_busy_us += tx_dur
                self.in_service = pkt
                events.append({'event': 'tx_start', 'packet': pkt.to_dict()})

        self.occupancy_series.append((sim_time_us, self.shared_buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        return {cls: len(self.queues[cls]) for cls in self.CLASSES}


class DRRScheduler:
    """Deficit Round Robin (DRR) — M. Shreedhar & G. Varghese, 1996.

    Achieves fair bandwidth allocation in O(1) time complexity per packet.
    Each class has a Quantum proportional to its configured weight.
    A round-robin pointer visits active queues, adding Quantum to the Deficit Counter.
    Packets are served as long as packet_size <= Deficit Counter.
    """
    CLASSES = ['voice', 'video', 'web', 'file']
    DEFAULT_WEIGHTS = {'voice': 4, 'video': 3, 'web': 2, 'file': 1}

    def __init__(
        self,
        buffer_limit: int,
        link_mbps: float,
        prop_delay_us: int,
        weights: Optional[Dict[str, int]] = None,
        drop_policy: str = 'tail_drop',
    ):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.weights: Dict[str, int] = weights if weights is not None else dict(self.DEFAULT_WEIGHTS)
        self.drop_policy = drop_policy

        # Quantum in bytes per class: base quantum = 500 B * weight
        self.quantum: Dict[str, int] = {cls: self.weights.get(cls, 1) * 500 for cls in self.CLASSES}
        self.deficit: Dict[str, int] = {cls: 0 for cls in self.CLASSES}
        self.round_started: Dict[str, bool] = {cls: False for cls in self.CLASSES}
        self.rr_idx: int = 0

        self.queues: Dict[str, deque[Packet]] = {cls: deque() for cls in self.CLASSES}
        self.shared_buffer_used = 0
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []

        self.avg_q = 0.0
        self.wq = 0.002
        self.rng = random.Random(42)

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Admit packet according to drop policy (tail_drop, push_out, wred)."""
        self.avg_q = (1.0 - self.wq) * self.avg_q + self.wq * self.shared_buffer_used

        if self.drop_policy == 'wred':
            if _wred_drop_check(packet.traffic_class, self.shared_buffer_used, self.buffer_limit, self.avg_q, self.rng):
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow' if self.shared_buffer_used >= self.buffer_limit else 'wred_early_drop'
                self.dropped.append(packet)
                return False

        elif self.shared_buffer_used >= self.buffer_limit:
            if self.drop_policy == 'push_out':
                evicted = False
                for low_cls in CLASS_ORDER_ASCENDING:
                    if CLASS_PRIORITY[low_cls] < packet.priority and self.queues[low_cls]:
                        victim = self.queues[low_cls].pop()
                        self.shared_buffer_used -= 1
                        victim.status = 'dropped'
                        victim.drop_reason = 'push_out'
                        self.dropped.append(victim)
                        evicted = True
                        break
                if not evicted:
                    packet.status = 'dropped'
                    packet.drop_reason = 'buffer_overflow'
                    self.dropped.append(packet)
                    return False
            else:
                packet.status = 'dropped'
                packet.drop_reason = 'buffer_overflow'
                self.dropped.append(packet)
                return False

        packet.status = 'in_queue'
        packet.queue_entry_time_us = sim_time_us
        self.queues[packet.traffic_class].append(packet)
        self.shared_buffer_used += 1
        return True

    def _select_next(self) -> Optional[Packet]:
        """Deficit Round Robin selection (O(1) amortized)."""
        if not any(self.queues[c] for c in self.CLASSES):
            return None

        attempts = 0
        while attempts < len(self.CLASSES) * 2:
            cls = self.CLASSES[self.rr_idx]
            q = self.queues[cls]

            if not q:
                self.deficit[cls] = 0
                self.round_started[cls] = False
                self.rr_idx = (self.rr_idx + 1) % len(self.CLASSES)
                attempts += 1
                continue

            if not self.round_started[cls]:
                self.deficit[cls] += self.quantum[cls]
                self.round_started[cls] = True

            pkt = q[0]
            if pkt.payload_bytes <= self.deficit[cls]:
                pkt = q.popleft()
                self.deficit[cls] -= pkt.payload_bytes
                self.shared_buffer_used -= 1

                if not q:
                    self.deficit[cls] = 0
                    self.round_started[cls] = False
                    self.rr_idx = (self.rr_idx + 1) % len(self.CLASSES)
                elif q[0].payload_bytes > self.deficit[cls]:
                    self.round_started[cls] = False
                    self.rr_idx = (self.rr_idx + 1) % len(self.CLASSES)
                return pkt
            else:
                self.round_started[cls] = False
                self.rr_idx = (self.rr_idx + 1) % len(self.CLASSES)
                attempts += 1

        return None

    def step(self, sim_time_us: int) -> List[Dict[str, Any]]:
        events = []

        if self.in_service is not None and sim_time_us >= self.tx_end_time_us:
            pkt = self.in_service
            pkt.tx_end_time_us = self.tx_end_time_us
            pkt.delivery_time_us = self.tx_end_time_us + self.prop_delay_us
            pkt.status = 'delivered'
            self.delivered.append(pkt)
            events.append({'event': 'delivered', 'packet': pkt.to_dict()})
            self.in_service = None

        if self.in_service is None:
            pkt = self._select_next()
            if pkt is not None:
                pkt.status = 'in_service'
                pkt.tx_start_time_us = sim_time_us
                tx_dur = pkt.tx_duration_us(self.link_mbps)
                self.tx_end_time_us = sim_time_us + tx_dur
                self.link_busy_us += tx_dur
                self.in_service = pkt
                events.append({'event': 'tx_start', 'packet': pkt.to_dict()})

        self.occupancy_series.append((sim_time_us, self.shared_buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        return {cls: len(self.queues[cls]) for cls in self.CLASSES}
