import { useState, useRef, useCallback } from 'react';
import type {
  SimConfig, SimResults, SimStatus, QueueSnapshot, PolicyType, PacketRecord,
} from '../types/simulation';

const WS_URL = 'ws://localhost:8000/ws/simulate';

export interface LiveEvent {
  id: number;
  policy: PolicyType;
  event: 'admitted' | 'dropped' | 'delivered';
  cls: string;
  bytes: number;
  time_us: number;
}

export function useSimulation() {
  const [status, setStatus]             = useState<SimStatus>('idle');
  const [progress, setProgress]         = useState<Record<PolicyType, number>>({ fifo: 0, spq: 0, wfq: 0 });
  const [results, setResults]           = useState<SimResults | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [snapshots, setSnapshots]       = useState<Record<PolicyType, QueueSnapshot[]>>({ fifo: [], spq: [], wfq: [] });
  const [totalPackets, setTotalPackets] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Accumulate packet chunks before final 'results' message arrives
  const packetBufRef = useRef<Record<PolicyType, PacketRecord[]>>({ fifo: [], spq: [], wfq: [] });

  // Live per-policy counters
  const [liveCounters, setLiveCounters] = useState<Record<PolicyType, { admitted: number; dropped: number }>>({
    fifo: { admitted: 0, dropped: 0 },
    spq:  { admitted: 0, dropped: 0 },
    wfq:  { admitted: 0, dropped: 0 },
  });

  // Rolling event log — last 40 notable packet events
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const eventIdRef = useRef(0);

  const run = useCallback((config: SimConfig) => {
    if (wsRef.current) wsRef.current.close();
    packetBufRef.current = { fifo: [], spq: [], wfq: [] };
    setStatus('connecting');
    setError(null);
    setResults(null);
    setSnapshots({ fifo: [], spq: [], wfq: [] });
    setProgress({ fifo: 0, spq: 0, wfq: 0 });
    setLiveCounters({ fifo: { admitted: 0, dropped: 0 }, spq: { admitted: 0, dropped: 0 }, wfq: { admitted: 0, dropped: 0 } });
    setLiveEvents([]);
    eventIdRef.current = 0;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(config));
      setStatus('running_fifo');
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      switch (msg.type) {
        case 'workload_ready':
          setTotalPackets(msg.total_packets);
          break;

        case 'tick': {
          const policy = msg.policy as PolicyType;
          if (policy === 'spq') setStatus('running_spq');
          if (policy === 'wfq') setStatus('running_wfq');
          setProgress((prev) => ({ ...prev, [policy]: msg.progress ?? 0 }));
          setSnapshots((prev) => {
            const next = [...prev[policy], {
              sim_time_us:   msg.sim_time_us,
              policy,
              queue_lengths: msg.queue_lengths,
              in_service:    msg.in_service,
            }].slice(-200);
            return { ...prev, [policy]: next };
          });

          // Parse events from this tick
          const tickEvents: Array<{ event: string; packet: PacketRecord }> = msg.events ?? [];
          if (tickEvents.length > 0) {
            const newFeed: LiveEvent[] = [];
            let admittedDelta = 0;
            let droppedDelta  = 0;
            for (const ev of tickEvents) {
              if (ev.event === 'admitted') admittedDelta++;
              if (ev.event === 'dropped')  droppedDelta++;
              if (ev.event === 'admitted' || ev.event === 'dropped' || ev.event === 'delivered') {
                newFeed.push({
                  id:      eventIdRef.current++,
                  policy,
                  event:   ev.event as LiveEvent['event'],
                  cls:     ev.packet.traffic_class,
                  bytes:   ev.packet.payload_bytes,
                  time_us: ev.packet.arrival_time_us,
                });
              }
            }
            if (admittedDelta > 0 || droppedDelta > 0) {
              setLiveCounters((prev) => ({
                ...prev,
                [policy]: {
                  admitted: prev[policy].admitted + admittedDelta,
                  dropped:  prev[policy].dropped  + droppedDelta,
                },
              }));
            }
            if (newFeed.length > 0) {
              setLiveEvents((prev) => [...prev, ...newFeed].slice(-40));
            }
          }
          break;
        }

        case 'policy_complete':
          if (msg.policy === 'fifo') setStatus('running_spq');
          if (msg.policy === 'spq')  setStatus('running_wfq');
          break;

        case 'packets_chunk': {
          const policy = msg.policy as PolicyType;
          packetBufRef.current[policy] = [
            ...packetBufRef.current[policy],
            ...(msg.packets as PacketRecord[]),
          ];
          break;
        }

        case 'results':
          setResults({
            fifo:         msg.fifo,
            spq:          msg.spq,
            wfq:          msg.wfq,
            packets_fifo: packetBufRef.current.fifo,
            packets_spq:  packetBufRef.current.spq,
            packets_wfq:  packetBufRef.current.wfq,
          });
          setStatus('complete');
          setProgress({ fifo: 100, spq: 100, wfq: 100 });
          break;

        case 'error':
          setError(msg.message);
          setStatus('error');
          break;
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed. Is the backend running on port 8000?');
      setStatus('error');
    };

    ws.onclose = () => { /* results already set */ };
  }, []);

  const reset = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    packetBufRef.current = { fifo: [], spq: [], wfq: [] };
    setStatus('idle');
    setResults(null);
    setError(null);
    setSnapshots({ fifo: [], spq: [], wfq: [] });
    setProgress({ fifo: 0, spq: 0, wfq: 0 });
    setLiveCounters({ fifo: { admitted: 0, dropped: 0 }, spq: { admitted: 0, dropped: 0 }, wfq: { admitted: 0, dropped: 0 } });
    setLiveEvents([]);
  }, []);

  return { status, progress, results, error, snapshots, totalPackets, liveCounters, liveEvents, run, reset };
}
