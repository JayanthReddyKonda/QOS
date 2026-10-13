from collections import deque
from typing import Optional, List, Dict, Any
from .packet import Packet

class FIFOScheduler:
    def __init__(self, buffer_limit: int, link_mbps: float, prop_delay_us: int):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.queue: deque[Packet] = deque()
        self.buffer_used = 0  # packets waiting (excl. in-service)
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0  # total ticks link was busy (for utilization)
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        # For queue occupancy time series: (sim_time_us, occupancy)
        self.occupancy_series: List[tuple] = []
        self.tick_us = 100  # tick resolution

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Try to admit packet to the queue. Returns True if admitted."""
        if self.buffer_used >= self.buffer_limit:
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

        # Record queue occupancy
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

    def __init__(self, buffer_limit: int, link_mbps: float, prop_delay_us: int):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.queues: Dict[int, deque[Packet]] = {p: deque() for p in self.PRIORITIES}
        self.shared_buffer_used = 0
        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Try to admit packet to the appropriate priority queue."""
        if self.shared_buffer_used >= self.buffer_limit:
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

        # Record occupancy
        self.occupancy_series.append((sim_time_us, self.shared_buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        cls_map = {4: 'voice', 3: 'video', 2: 'web', 1: 'file'}
        return {cls_map[p]: len(self.queues[p]) for p in self.PRIORITIES}


class WFQScheduler:
    """Weighted Fair Queuing (simplified PGPS) — non-preemptive, shared buffer.

    Each traffic class is assigned a weight. When the link is free, the head-of-line
    packet across all non-empty queues with the *minimum virtual finish time* (VFT) is
    selected for service.

        VFT(p, class c) = max(VFT_prev_in_c, V(t)) + packet_bits / weight_c

    where V(t) is the current simulated time (virtual clock).  This guarantees that
    each class receives bandwidth proportional to its weight over the long run.

    Non-preemption: an in-service packet is never interrupted; the VFT comparison only
    applies when choosing the *next* packet to send.
    """

    CLASSES = ['voice', 'video', 'web', 'file']
    DEFAULT_WEIGHTS = {'voice': 4, 'video': 3, 'web': 2, 'file': 1}

    def __init__(
        self,
        buffer_limit: int,
        link_mbps: float,
        prop_delay_us: int,
        weights: Optional[Dict[str, int]] = None,
    ):
        self.buffer_limit = buffer_limit
        self.link_mbps = link_mbps
        self.prop_delay_us = prop_delay_us
        self.weights: Dict[str, int] = weights if weights is not None else dict(self.DEFAULT_WEIGHTS)

        # Per-class FIFO queues
        self.queues: Dict[str, deque] = {cls: deque() for cls in self.CLASSES}
        self.shared_buffer_used = 0

        self.in_service: Optional[Packet] = None
        self.tx_end_time_us: int = 0
        self.link_busy_us: int = 0
        self.delivered: List[Packet] = []
        self.dropped: List[Packet] = []
        self.occupancy_series: List[tuple] = []

        # Per-class virtual finish time tracker
        self._vft: Dict[str, float] = {cls: 0.0 for cls in self.CLASSES}

    def admit(self, packet: Packet, sim_time_us: int) -> bool:
        """Try to enqueue packet. Tail-drop if shared buffer is full."""
        if self.shared_buffer_used >= self.buffer_limit:
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
        """Choose the HOL packet with minimum virtual finish time across all non-empty queues."""
        best_cls: Optional[str] = None
        best_vft: float = float('inf')

        for cls in self.CLASSES:
            if not self.queues[cls]:
                continue
            pkt = self.queues[cls][0]  # head of line (don't pop yet)
            w = self.weights.get(cls, 1)
            pkt_bits = pkt.payload_bytes * 8.0
            # VFT = max(last VFT for this class, current time) + bits / weight
            vft = max(self._vft[cls], float(now_us)) + pkt_bits / w
            if vft < best_vft:
                best_vft = vft
                best_cls = cls

        if best_cls is None:
            return None

        pkt = self.queues[best_cls].popleft()
        self._vft[best_cls] = best_vft  # remember finish time for next packet in same class
        self.shared_buffer_used -= 1
        return pkt

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

        # Start next packet (minimum-VFT selection — non-preemptive)
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

        # Record occupancy
        self.occupancy_series.append((sim_time_us, self.shared_buffer_used))
        return events

    @property
    def queue_lengths(self) -> Dict[str, int]:
        return {cls: len(self.queues[cls]) for cls in self.CLASSES}
