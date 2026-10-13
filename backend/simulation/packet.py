from dataclasses import dataclass, field
from typing import Optional

CLASS_PRIORITY = {
    'voice': 4,
    'video': 3,
    'web': 2,
    'file': 1,
}

CLASS_COLORS = {
    'voice': 'green',
    'video': 'blue',
    'web': 'orange',
    'file': 'gray',
}

@dataclass
class Packet:
    packet_id: int
    traffic_class: str        # 'voice' | 'video' | 'web' | 'file'
    priority: int             # 4=voice, 3=video, 2=web, 1=file
    payload_bytes: int
    arrival_time_us: int      # simulated time in microseconds
    queue_entry_time_us: Optional[int] = None
    tx_start_time_us: Optional[int] = None
    tx_end_time_us: Optional[int] = None
    delivery_time_us: Optional[int] = None
    status: str = 'pending'   # 'pending' | 'in_queue' | 'in_service' | 'delivered' | 'dropped'
    drop_reason: Optional[str] = None

    def tx_duration_us(self, link_mbps: float) -> int:
        """Transmission time in microseconds: bits / (Mbps * 1e6) * 1e6."""
        bits = self.payload_bytes * 8.0
        return max(1, int(round(bits / max(0.1, link_mbps))))

    def to_dict(self) -> dict:
        return {
            'packet_id': self.packet_id,
            'traffic_class': self.traffic_class,
            'priority': self.priority,
            'payload_bytes': self.payload_bytes,
            'arrival_time_us': self.arrival_time_us,
            'queue_entry_time_us': self.queue_entry_time_us,
            'tx_start_time_us': self.tx_start_time_us,
            'tx_end_time_us': self.tx_end_time_us,
            'delivery_time_us': self.delivery_time_us,
            'status': self.status,
            'drop_reason': self.drop_reason,
        }
