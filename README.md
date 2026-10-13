# QoS Traffic Manager

A Computer Networks course project implementing and comparing three packet scheduling algorithms — **FIFO**, **Strict Priority Queuing (SPQ)**, and **Weighted Fair Queuing (WFQ)** — on a simulated congested bottleneck link.

---

## Overview

The simulator generates a reproducible synthetic workload (Poisson arrivals, four traffic classes) and replays it through all three schedulers side-by-side, streaming live results to a React dashboard over WebSocket.

| Scheduler | Selection policy | Bandwidth guarantee |
|-----------|-----------------|-------------------|
| **FIFO** | Arrival order | None — all classes share equally |
| **SPQ** | Highest non-empty priority queue | Absolute: Voice always before Video before Web before File |
| **WFQ** | Minimum virtual finish time | Proportional: weights 4 / 3 / 2 / 1 per class |

---

## Traffic Classes

| Class | SPQ Priority | WFQ Weight | Packet Size | BW Share |
|-------|-------------|-----------|-------------|---------|
| Voice | 4 (highest) | 4 | 160 B (fixed) | 5% |
| Video | 3 | 3 | 400–1 400 B | 25% |
| Web | 2 | 2 | 200–1 500 B | 25% |
| File Transfer | 1 (lowest) | 1 | 1 000–1 500 B | 45% |

---

## Project Structure

```
QOS/
├── backend/
│   ├── simulation/
│   │   ├── packet.py          # Packet dataclass & lifecycle
│   │   ├── traffic_generator.py # Calibrated Poisson workload generator
│   │   ├── scheduler.py       # FIFOScheduler, SPQScheduler, WFQScheduler
│   │   ├── metrics.py         # Section 12 metric computations
│   │   └── simulator.py       # Async tick loop + WebSocket streaming
│   ├── tests/
│   │   └── test_simulation.py # 13 acceptance tests (pytest)
│   ├── main.py                # FastAPI app + WebSocket endpoint
│   ├── run.py                 # Uvicorn entry point
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.tsx            # Layout, routing, running/idle states
        ├── components/        # ControlPanel, ArchitectureGuide, tab views
        ├── hooks/
        │   └── useSimulation.ts # WebSocket + state management
        └── types/
            └── simulation.ts  # Shared TypeScript types
```

---

## Setup & Running

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py          # FastAPI on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # Vite dev server on http://localhost:5173
```

### Tests

```bash
cd backend
python -m pytest tests/ -v   # 13 tests, all should pass
```

---

## Key Metrics Computed

- **Offered load** (Mbps, % of link capacity)
- **Avg / max queueing delay** per class
- **Avg end-to-end latency** (queue + tx + propagation)
- **Delay variation** (jitter proxy)
- **Packet drop rate** per class (tail-drop)
- **Throughput** (Mbps)
- **Link utilization** (%)
- **Time-weighted avg queue occupancy**

---

## WFQ Algorithm

Implements simplified PGPS (Packet-by-packet Generalised Processor Sharing):

```
VFT(p, class c) = max(VFT_prev[c], now) + packet_bits / weight_c
```

The packet with the minimum VFT across all non-empty queues is served next.
Non-preemptive: an in-service packet is never interrupted.

**Reference:** Demers, Keshav, Shenker — *Analysis and Simulation of a Fair Queuing Algorithm*, SIGCOMM 1989.

---

## Acceptance Tests (A1–A13)

| ID | Description |
|----|-------------|
| A1 | FIFO serves packets in arrival order |
| A2 | SPQ serves voice before video before web before file |
| A3 | SPQ non-preemption |
| A4 | Buffer tail-drop enforced |
| A5 | Same seed → identical workload |
| A6 | generated = delivered + dropped (all 3 policies) |
| A7 | All metrics in valid ranges |
| A8 | Runs with same seed produce identical results |
| A9 | Per-class sums equal aggregate metrics |
| A10 | SPQ voice delay < FIFO voice delay under congestion |
| A11 | WFQ buffer limit enforced |
| A12 | WFQ non-preemption |
| A13 | WFQ voice delay ≤ file delay (proportional bandwidth) |
