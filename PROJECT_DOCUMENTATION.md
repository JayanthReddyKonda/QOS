# Quality of Service (QoS) Traffic Manager & Network Scheduler Evaluation

> **A Computer Networks (CN) Capstone Simulation Project**  
> Comparing **FIFO**, **Strict Priority Queuing (SPQ)**, **Weighted Fair Queuing (WFQ)**, and **Deficit Round Robin (DRR)** with **Tail-Drop**, **Push-Out (Priority Eviction)**, and **Weighted Random Early Detection (WRED)** Buffer Management.

---

## 1. Executive Summary & Purpose

In modern packet-switched IP networks, network links frequently encounter transient or sustained congestion. In an unmanaged network running traditional **First-In, First-Out (FIFO)** queueing with **Tail-Drop** buffer management, bursty and large-packet bulk traffic (such as FTP downloads or system backups) easily fills router queues, introducing catastrophic bufferbloat, serialization delays, and arbitrary packet drops for latency-critical and interactive applications (such as VoIP calls and video conferencing).

The **QoS Traffic Manager** is an empirical, discrete-time network simulation and interactive analytics system built to demonstrate, benchmark, and visualize how modern **Differentiated Services (DiffServ)** scheduling algorithms and active queue management (AQM) strategies resolve this problem.

### Key Capabilities
- **Classic Academic Scheduler Quartet:** Implements FIFO, SPQ, WFQ, and DRR side-by-side.
- **Configurable Buffer Drop Policies:** Demonstrates the fundamental distinction between *transmission scheduling* (packet ordering) and *buffer memory management* (who is dropped when RAM is exhausted) through **Tail-Drop**, **Push-Out (Priority Eviction)**, and **WRED**.
- **Identical Workload Replay:** A synthetic Poisson workload with four traffic classes is generated once per seed and replayed deterministically through each policy, ensuring mathematical fairness.
- **Dynamic Bandwidth & Latency Analytics:** Features live queue occupancy bars, interactive packet traces, synchronized occupancy curves, and a 100 ms time-binned dynamic bandwidth stacked-area timeline against the link capacity ceiling.
- **Zero "AI Slop" Design:** Clean, high-contrast academic interface designed with light/white palette, precise mathematical typography, formal citations, and zero placeholder gimmicks.

---

## 2. Complete Technology Stack

### Backend Architecture
- **Language & Runtime:** Python 3.10+ (tested on Python 3.13)
- **Web Framework:** [FastAPI](https://fastapi.tiangolo.com/) (high-performance asynchronous API framework)
- **ASGI Server:** [Uvicorn](https://www.uvicorn.org/) (lightning-fast ASGI web server)
- **Communication Protocol:** WebSockets (RFC 6455) for bidirectional real-time event streaming and batch packet trace transmission
- **Data Models:** Standard library `dataclasses` with strict type annotations
- **Unit Testing:** [Pytest](https://pytest.org/) (18 automated acceptance tests: `A1`–`A18`)

### Frontend Architecture
- **Framework & Language:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (strict mode, full type safety)
- **Bundler & Tooling:** [Vite 8](https://vitejs.dev/)
- **Styling System:** [Tailwind CSS](https://tailwindcss.com/) (custom utility classes, accessible light theme)
- **Data Visualization:** [Recharts](https://recharts.org/) (ResponsiveContainer, AreaChart, BarChart, LineChart, ReferenceLine)
- **Export Capabilities:** Client-side CSV generation with automatic RFC 4180 escaping for aggregate summaries and raw per-packet traces

---

## 3. Network Architecture & Traffic Model

```
Traffic Sources (Poisson Process)
 ├── Class 4: Voice   (160 B fixed, 20 ms interval)   ──┐
 ├── Class 3: Video   (400–1400 B,  8 ms interval)    ──┼──> [ Ingress Classifier ]
 ├── Class 2: Web     (200–1500 B, 15 ms interval)    ──┤             │
 └── Class 1: File    (1000–1500 B, 5 ms interval)    ──┘             ▼
                                                        [ Shared Buffer Memory (K pkts) ]
                                                        [ Drop Policy: Tail-Drop / Push-Out / WRED ]
                                                                      │
                                                                      ▼
                                                        [ Packet Scheduler ]
                                                        (FIFO / SPQ / WFQ / DRR)
                                                                      │
                                                                      ▼
                                                        [ Bottleneck Link (C Mbps) ]
                                                                      │
                                                                      ▼
                                                                [ Destination ]
```

### Traffic Classes (DiffServ Mapping)

| Class | Traffic Type | Priority | WFQ Weight | DRR Quantum | Packet Size | Poisson Mean ($\lambda^{-1}$) | Real-World Analog |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **Voice** | Real-Time Audio | 4 (Highest) | $w = 4$ | 2,000 B | 160 B (Fixed) | 20.0 ms | VoIP (G.711 codec), Discord audio |
| **Video** | Interactive Streaming | 3 (High) | $w = 3$ | 1,500 B | 400–1,400 B | 8.0 ms | Zoom, WebRTC video stream |
| **Web** | Transactional Data | 2 (Medium) | $w = 2$ | 1,000 B | 200–1,500 B | 15.0 ms | HTTP/2 API responses, browsing |
| **File** | Bulk Data Transfer | 1 (Lowest) | $w = 1$ | 500 B | 1,000–1,500 B | 5.0 ms | Large file downloads, backups, FTP |

### Load Profiles & Offered Traffic

The load profile multiplier adjusts inter-arrival times to stress the link:
- **Low Load (~50% offered):** Link operates comfortably below capacity ($2.0\times$ inter-arrival). Zero drops, minimal queuing.
- **Near Capacity (~95% offered):** Near saturation ($1.1\times$ inter-arrival). Transient queues form; initial loss occurs.
- **Congested (~130% offered):** Bottleneck link oversubscribed ($0.77\times$ inter-arrival). FIFO latency skyrockets; priority differentiation becomes critical.
- **Heavy Congestion (~170% offered):** Extreme stress ($0.59\times$ inter-arrival). Buffer is perpetually full; highlights starvation and isolation tradeoffs.

---

## 4. The Academic Scheduler Quartet

### 1. FIFO (First-In, First-Out — Baseline)
- **Algorithm:** Packets enter a single FIFO deque and transmit in strict arrival timestamp order.
- **Selection Complexity:** $O(1)$ deque `popleft()`.
- **Properties:** Class-blind. When heavy file packets arrive, smaller voice packets are trapped behind them (head-of-line blocking). Under congestion, voice latency degrades to match bulk file delay (~40–45 ms).

### 2. SPQ (Strict Priority Queuing)
- **Algorithm:** Four independent FIFO deques (one per priority level $4 \to 1$). The link inspects queues in descending priority order and dequeues the first available packet.
- **Selection Complexity:** $O(P)$ where $P = 4$.
- **Non-Preemption Guarantee:** An in-service packet transmitting on the link is never interrupted.
- **Properties:** Maximizes performance for real-time voice, slashing voice queuing delay from ~35 ms to < 1 ms. However, under heavy loads, low-priority queues (Web, File) experience **starvation** because higher queues completely monopolize transmission opportunities.
- **Citation:** RFC 4594 — *Configuration Guidelines for DiffServ*.

### 3. WFQ (Weighted Fair Queuing — PGPS)
- **Algorithm:** Implements Packet-by-Packet Generalized Processor Sharing (PGPS). Each class $c$ maintains a Virtual Finish Time ($VFT_c$):
  $$\text{VFT}(p, c) = \max(\text{VFT}_{\text{prev}}[c], \text{now}) + \frac{\text{packet\_bits}}{w_c}$$
  When the link completes transmission, it selects the head-of-line packet with the minimum $VFT$ across all backlogged queues.
- **Selection Complexity:** $O(\log N)$ or $O(C)$ where $C$ is the number of active classes.
- **Properties:** Guarantees bandwidth proportional to weights ($w_{\text{voice}} : w_{\text{video}} : w_{\text{web}} : w_{\text{file}} = 4 : 3 : 2 : 1$). Lower-priority queues are protected from complete starvation while voice retains low latency.
- **Citation:** Demers, Keshav, Shenker — *"Analysis and Simulation of a Fair Queuing Algorithm"*, ACM SIGCOMM 1989.

### 4. DRR (Deficit Round Robin)
- **Algorithm:** Overcomes the $O(\log N)$ sorting complexity of WFQ by operating in round-robin fashion using byte credits:
  - Each class receives a configured **Quantum** per round (Voice: 2000 B, Video: 1500 B, Web: 1000 B, File: 500 B).
  - In each round, for an active class:
    $$\text{Deficit}_c \leftarrow \text{Deficit}_c + \text{Quantum}_c$$
  - The scheduler serves packets while $\text{payload\_bytes} \le \text{Deficit}_c$, deducting size from the deficit.
  - If a queue becomes empty, its deficit is reset to 0 to prevent unfair credit hoarding.
- **Selection Complexity:** $O(1)$ amortized per packet.
- **Properties:** Highly suitable for high-speed hardware switches (e.g. Cisco Catalyst, Juniper) where sorting virtual finish times at 100+ Gbps is computationally infeasible.
- **Citation:** M. Shreedhar and G. Varghese — *"Efficient Fair Queueing Using Deficit Round-Robin"*, IEEE/ACM Transactions on Networking, 1996.

---

## 5. Buffer Drop Management Strategies

A critical insight in computer networking is that **schedulers dictate transmission order, while buffer managers dictate drop decisions.**

```
Buffer Full (50 packets occupied)
Incoming Packet Arrives
  │
  ├─> [ Tail-Drop ]      ──> Reject arriving packet regardless of class
  │
  ├─> [ Push-Out ]       ──> Is arriving packet higher priority than lowest in buffer?
  │                            ├─ YES: Evict lowest-priority waiting packet; admit arriving packet
  │                            └─ NO:  Drop arriving packet
  │
  └─> [ WRED ]           ──> Track EWMA: avg_q = (1 - wq)*avg_q + wq*inst_q
                               Probabilistic early drop on bulk traffic before buffer fills!
```

### Comparison of Buffer Drop Policies

| Policy | Mechanism | Voice Drop Rate Under Congestion | File Drop Rate Under Congestion | Primary Purpose |
|---|---|:---:|:---:|---|
| **Tail-Drop (Normal)** | Class-blind rejection once `buffer_used >= limit` | ~28.5% | ~28.5% | Simple baseline; causes global synchronization and class-blind loss |
| **Push-Out (Priority Eviction)** | High-priority packets evict lowest-priority packets from the tail of the buffer | **0.0%** | ~48.2% | True loss protection for real-time voice/video |
| **WRED** | Probabilistic early drop based on EWMA queue length and class thresholds | ~4.2% | ~36.8% | Prevents bufferbloat and avoids global synchronization |

---

## 6. Mathematical Metric Formulations (Spec §12)

Every metric in the system is calculated mathematically from per-packet timestamps:

1. **Queueing Delay:**
   $$T_{\text{queue}}(p) = T_{\text{tx\_start}}(p) - T_{\text{queue\_entry}}(p) \quad [\text{ms}]$$

2. **End-to-End Latency:**
   $$T_{\text{e2e}}(p) = T_{\text{delivery}}(p) - T_{\text{arrival}}(p) = T_{\text{queue}}(p) + T_{\text{tx}}(p) + T_{\text{prop}} \quad [\text{ms}]$$

3. **Packet Transmission Time:**
   $$T_{\text{tx}}(p) = \max\left(1, \left\lfloor \frac{\text{payload\_bytes} \times 8}{C_{\text{link}} \times 10^6} \times 10^6 \right\rceil\right) \quad [\mu\text{s}]$$

4. **Delay Variation (Jitter Metric):**
   $$\text{Jitter} = \frac{1}{N-1} \sum_{i=1}^{N-1} \left| T_{\text{e2e}}(p_{i+1}) - T_{\text{e2e}}(p_i) \right| \quad [\text{ms}]$$

5. **Delivered Throughput:**
   $$\text{Throughput} = \frac{\sum_{p \in \text{Delivered}} \text{payload\_bytes}(p) \times 8}{T_{\text{sim\_duration\_s}} \times 10^6} \quad [\text{Mbps}]$$

6. **Link Utilization:**
   $$U_{\text{link}} = \min\left(100.0, \frac{\sum T_{\text{tx\_busy}}}{T_{\text{sim\_duration}}} \times 100\right) \quad [\%]$$

7. **Packet Drop Rate:**
   $$\text{Drop Rate} = \frac{N_{\text{dropped}}}{N_{\text{generated}}} \times 100 \quad [\%]$$

8. **Time-Weighted Average Queue Occupancy:**
   $$\bar{Q} = \frac{1}{T_{\text{total}}} \sum_{i=0}^{K-1} Q_i \cdot (t_{i+1} - t_i) \quad [\text{packets}]$$

---

## 7. Interactive Analytics Dashboard

The frontend dashboard provides 6 purpose-built views:

1. **Overview Tab:** Executive high-level card metrics, load badge, drop policy badge, and aggregate 4-scheduler comparison table with percentage latency savings.
2. **Class Comparison Tab:** Per-class breakdown with automated comparative analysis, identifying best-performing algorithms for each traffic type.
3. **Performance & Bandwidth Analytics Tab:**
   - **Dynamic Bandwidth Timeline (Stacked Area):** 100 ms time-binned class bandwidth utilization with red dashed line at bottleneck link capacity and interactive scheduler toggle (`[FIFO] [SPQ] [WFQ] [DRR]`).
   - **Synchronized Queue Occupancy Line Chart:** Time-normalized queue trajectory across all 4 algorithms.
   - **Offered vs. Delivered Throughput Bar Chart:** Side-by-side comparison illustrating traffic delivered vs lost per class.
   - **E2E Latency & Drop Rate Charts:** Side-by-side grouped bar comparisons.
4. **Queue Analysis Tab:** Live queue occupancy breakdown, buffer fill gauges, and drop distribution per class.
5. **Packet Trace Log Tab:** Full per-packet lifecycle inspector with pagination, class filter, policy selector, and status filter (`Delivered` / `Dropped`).
6. **Architecture & Theory Guide:** Full academic walkthrough with mathematical formulas, ASCII queue diagrams, Big-O complexities, and RFC citations.

---

## 8. Verification & Test Suite

The project includes two rigorous verification suites:

### 1. Pytest Unit Suite (`backend/tests/test_simulation.py`)
18 automated unit tests covering all core requirements:
- `A1`: FIFO strictly serves in arrival order
- `A2`: SPQ serves voice before video before web before file
- `A3`: SPQ non-preemption (in-service transmission not interrupted)
- `A4`: Buffer tail-drop enforced at limit
- `A5`: Same seed produces identical workload
- `A6`: Count reconciliation: $\text{generated} = \text{delivered} + \text{dropped}$ across all 4 policies
- `A7`: All metrics in valid numeric ranges
- `A8`: Repeated runs with same seed produce byte-identical workloads
- `A9`: Per-class metric sums strictly equal aggregate metrics
- `A10`: SPQ voice delay < FIFO voice delay under congestion
- `A11`: WFQ buffer limit enforced
- `A12`: WFQ non-preemption verified
- `A13`: WFQ proportional bandwidth guarantee verified
- `A14`: DRR deficit counter round-robin fairness verified
- `A15`: Push-Out buffer policy protects voice (Voice drop rate < 5.0%, File absorbs loss)
- `A16`: WRED early drop triggers before hard buffer overflow
- `A17`: Transmission duration calculation edge-case robustness
- `A18`: Downsampled occupancy series schema and time-point verification

### 2. End-to-End Scenario Verification Harness (`backend/tests/verify_all_scenarios.py`)
Executes live WebSocket test runs across:
- All 4 load profiles: `Low`, `Near Capacity`, `Congested`, `Heavy`
- All 3 drop policies: `Tail-Drop`, `Push-Out`, `WRED`
- Asserts packet trace count match, zero voice drops under Push-Out, and proper latency separation.

---

## 9. Quick Start & Execution Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start the Backend Server
```bash
cd backend
pip install -r requirements.txt
python run.py
```
*Backend initializes on `http://localhost:8000` (`WebSocket: ws://localhost:8000/ws/simulate`).*

### 2. Start the Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Frontend interface available on `http://localhost:5173`.*

### 3. Run Automated Tests
```bash
# Run 18 unit tests:
python -m pytest backend/tests/test_simulation.py -v

# Run live WebSocket scenario verification harness:
python backend/tests/verify_all_scenarios.py
```

### 4. Build for Production
```bash
cd frontend
npm run build
```

---

## 10. Educational References & Citations

1. **DiffServ Architecture:** Blake, S., et al. *"An Architecture for Differentiated Services"*, RFC 2475, Dec 1998.
2. **DiffServ Class Guidelines:** Babiarz, J., et al. *"Configuration Guidelines for DiffServ Service Classes"*, RFC 4594, Aug 2006.
3. **Weighted Fair Queuing:** Demers, A., Keshav, S., & Shenker, S. *"Analysis and Simulation of a Fair Queuing Algorithm"*, ACM SIGCOMM Computer Communication Review, 1989.
4. **Deficit Round Robin:** Shreedhar, M., & Varghese, G. *"Efficient Fair Queueing Using Deficit Round-Robin"*, IEEE/ACM Transactions on Networking, 1996.
5. **Random Early Detection:** Floyd, S., & Jacobson, V. *"Random Early Detection Gateways for Congestion Avoidance"*, IEEE/ACM Transactions on Networking, 1993.
