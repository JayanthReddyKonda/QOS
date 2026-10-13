# QoS Traffic Manager & Network Scheduler Simulator

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0%2B-646cff.svg)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Pytest-18%2F18%20Passing-success.svg)](https://pytest.org/)

An advanced discrete-time Computer Networks simulation comparing the classic academic quartet of packet scheduling algorithms (**FIFO**, **SPQ**, **WFQ**, and **DRR**) alongside three buffer drop policies (**Tail-Drop**, **Push-Out / Priority Eviction**, and **WRED**) over a shared congested bottleneck link.

---

## Features

- **Academic Scheduler Quartet:**
  - **FIFO (First-In, First-Out):** Baseline arrival order queueing.
  - **SPQ (Strict Priority Queuing):** Non-preemptive priority queueing protecting real-time voice.
  - **WFQ (Weighted Fair Queuing):** Minimum Virtual Finish Time ($VFT$) tracking based on Demers et al. (PGPS).
  - **DRR (Deficit Round Robin):** Hardware-efficient $O(1)$ fair queueing based on Shreedhar & Varghese (1996).
- **Buffer Drop Management:**
  - **Tail-Drop (Normal):** Classic class-blind buffer saturation drop.
  - **Push-Out (Priority Eviction):** Low-priority bulk packets evicted when buffer is full, reducing voice loss to **0.0%**.
  - **WRED (Weighted Random Early Detection):** EWMA queue tracking with probabilistic early drops to prevent bufferbloat.
- **Dynamic Bandwidth & Latency Analytics:**
  - Dynamic 100 ms time-binned Bandwidth Allocation Timeline (Stacked Area Chart) with bottleneck link capacity reference line.
  - Synchronized Queue Occupancy time series with binary search interpolation.
  - Offered Load vs. Delivered Throughput side-by-side comparison per class.
  - Per-packet trace log with pagination, status filters, and CSV export.
- **Clean Academic UI:** High-contrast, clean light palette, zero cheesy emoji icons, mathematically accurate typography.

---

## Traffic Classes & Parameters

| Class | Traffic Type | Priority | WFQ Weight | DRR Quantum | Packet Size | Poisson Mean | Real-World Analog |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **Voice** | Real-Time Audio | 4 (Highest) | $w = 4$ | 2,000 B | 160 B (Fixed) | 20.0 ms | VoIP (G.711), Discord |
| **Video** | Streaming Video | 3 (High) | $w = 3$ | 1,500 B | 400–1,400 B | 8.0 ms | Zoom, WebRTC stream |
| **Web** | Transactional | 2 (Medium) | $w = 2$ | 1,000 B | 200–1,500 B | 15.0 ms | HTTP/2 API responses |
| **File** | Bulk Transfer | 1 (Lowest) | $w = 1$ | 500 B | 1,000–1,500 B | 5.0 ms | FTP, cloud backups |

---

## Quick Start

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python run.py
# Server running at http://localhost:8000 (WebSocket: ws://localhost:8000/ws/simulate)
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Dashboard running at http://localhost:5173
```

### 3. Run Automated Tests
```bash
# Run all 18 Pytest acceptance tests:
python -m pytest backend/tests/test_simulation.py -v

# Run live WebSocket end-to-end scenario verification suite:
python backend/tests/verify_all_scenarios.py
```

### 4. Build for Production
```bash
cd frontend
npm run build
```

---

## Documentation

For a comprehensive explanation of the theoretical principles, mathematical formulas, DiffServ mappings, and implementation details, please refer to:

👉 **[Complete Project Documentation](PROJECT_DOCUMENTATION.md)**

---

## Repository Structure

```
QOS/
├── backend/
│   ├── simulation/
│   │   ├── packet.py             # Packet dataclass & transmission model
│   │   ├── traffic_generator.py  # Seeded Poisson workload generator
│   │   ├── scheduler.py          # FIFO, SPQ, WFQ, DRR & Drop Policies
│   │   ├── metrics.py            # Aggregate & per-class Section 12 metrics
│   │   └── simulator.py          # 100 µs tick orchestrator & WS streamer
│   ├── tests/
│   │   ├── test_simulation.py    # 18 automated Pytest unit tests (A1–A18)
│   │   └── verify_all_scenarios.py # End-to-end WebSocket scenario test harness
│   ├── main.py                   # FastAPI application & WebSocket route
│   ├── run.py                    # Uvicorn entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ControlPanel.tsx  # Interactive parameters & buffer policy selector
│   │   │   ├── ExportButton.tsx  # RFC 4180 CSV export utility
│   │   │   ├── ArchitectureGuide.tsx # Formal algorithm specifications & citations
│   │   │   └── tabs/             # Overview, Comparison, Charts, Queue, Trace tabs
│   │   ├── hooks/
│   │   │   └── useSimulation.ts  # Real-time WebSocket state management hook
│   │   ├── types/
│   │   │   └── simulation.ts     # TypeScript data contracts & constants
│   │   ├── utils/
│   │   │   └── bandwidth.ts      # Time-binned throughput & bandwidth analytics
│   │   ├── App.tsx               # Primary dashboard layout & live state pipeline
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── PROJECT_DOCUMENTATION.md      # Comprehensive academic project documentation
└── README.md
```

---

## Acceptance Test Matrix (Pytest — 18/18 Passing)

| Test ID | Verification Target |
|:---:|---|
| **A1** | FIFO serves packets in arrival timestamp order |
| **A2** | SPQ prioritizes Voice > Video > Web > File |
| **A3** | SPQ non-preemption: in-service packet is never interrupted |
| **A4** | Buffer tail-drop strictly enforced at capacity limit |
| **A5** | Workload reproducibility across seeds |
| **A6** | Conservation law: $\text{generated} = \text{delivered} + \text{dropped}$ |
| **A7** | Metric boundaries: utilization $\le 100\%$, drop rate $\le 100\%$, positive delays |
| **A8** | Byte-identical reproducibility on repeated seed executions |
| **A9** | Dashboard reconciliation: sum of class metrics matches aggregates |
| **A10** | SPQ priority trade-off: Voice delay < FIFO Voice delay under congestion |
| **A11** | WFQ buffer limit enforced |
| **A12** | WFQ non-preemption verified |
| **A13** | WFQ proportional bandwidth allocation verified |
| **A14** | DRR deficit counter round-robin fairness verified |
| **A15** | Push-Out buffer policy protects Voice (Voice drops < 5.0%, File absorbs loss) |
| **A16** | WRED early drop triggers prior to hard buffer saturation |
| **A17** | Packet transmission duration calculation edge-case robustness |
| **A18** | Queue occupancy downsampling schema and time-point verification |
