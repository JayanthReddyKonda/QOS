import asyncio, json, sys, io

async def test_all_scenarios():
    import websockets

    scenarios = [
        ('low', 50.0),
        ('near_capacity', 95.0),
        ('congested', 130.0),
        ('heavy', 170.0),
    ]

    for profile, target_pct in scenarios:
        config = {
            'seed': 42,
            'load_profile': profile,
            'link_mbps': 10.0,
            'buffer_limit': 50,
            'prop_delay_ms': 10.0,
            'duration_ms': 3000,
        }
        print(f"\n=======================================================")
        print(f"TESTING SCENARIO: {profile.upper()} (Target: ~{target_pct}%)")
        print(f"=======================================================")

        async with websockets.connect('ws://localhost:8000/ws/simulate', max_size=None) as ws:
            await ws.send(json.dumps(config))
            packets_fifo = []
            packets_spq = []
            final_metrics = None

            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=60)
                msg = json.loads(raw)
                mtype = msg.get('type')

                if mtype == 'packets_chunk':
                    if msg['policy'] == 'fifo':
                        packets_fifo.extend(msg['packets'])
                    else:
                        packets_spq.extend(msg['packets'])

                if mtype == 'results':
                    final_metrics = msg
                    break

            f = final_metrics['fifo']
            s = final_metrics['spq']

            # Assertions
            fifo_ok = f['generated'] == f['delivered'] + f['dropped']
            spq_ok = s['generated'] == s['delivered'] + s['dropped']
            assert fifo_ok and spq_ok, "Count reconciliation failed!"
            assert len(packets_fifo) == f['generated'], "FIFO packet trace count mismatch!"
            assert len(packets_spq) == s['generated'], "SPQ packet trace count mismatch!"

            print(f"  Generated Packets:  {f['generated']}")
            print(f"  Offered Load:       {f['offered_load_mbps']:.2f} Mbps ({f['offered_load_pct']:.1f}% of link)")
            print(f"  FIFO Delivered:     {f['delivered']} | Dropped: {f['dropped']} ({f['drop_rate_pct']:.1f}%) | Util: {f['link_utilization_pct']:.1f}%")
            print(f"  SPQ  Delivered:     {s['delivered']} | Dropped: {s['dropped']} ({s['drop_rate_pct']:.1f}%) | Util: {s['link_utilization_pct']:.1f}%")

            vf = f['per_class']['voice']['avg_e2e_delay_ms']
            vs = s['per_class']['voice']['avg_e2e_delay_ms']
            ff = f['per_class']['file']['avg_e2e_delay_ms']
            fs = s['per_class']['file']['avg_e2e_delay_ms']

            print(f"  Voice Delay:        FIFO = {vf:.2f} ms | SPQ = {vs:.2f} ms")
            print(f"  Bulk File Delay:    FIFO = {ff:.2f} ms | SPQ = {fs:.2f} ms")

            if profile in ['congested', 'heavy']:
                assert vs < vf, f"Expected SPQ voice delay ({vs:.2f}) < FIFO voice delay ({vf:.2f})"
                print(f"  Trade-off Verified: Voice delay improved by {vf - vs:.2f} ms with SPQ!")

            print(f"  Scenario {profile.upper()} PASSED (Count consistency: OK, Metrics: OK, Trace: OK)")

    print("\n>>> ALL 4 EXPERIMENT MATRIX SCENARIOS VERIFIED SUCCESSFULLY! <<<")

if __name__ == '__main__':
    asyncio.run(test_all_scenarios())
