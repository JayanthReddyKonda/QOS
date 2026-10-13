import asyncio
import json
import websockets

async def run_scenario_test(profile: str, drop_policy: str = 'tail_drop', duration_ms: int = 3000):
    config = {
        'seed': 42,
        'load_profile': profile,
        'link_mbps': 10.0,
        'buffer_limit': 50,
        'prop_delay_ms': 10.0,
        'duration_ms': duration_ms,
        'drop_policy': drop_policy,
    }

    print(f"\n=======================================================")
    print(f"TESTING: Profile={profile.upper()} | DropPolicy={drop_policy.upper()}")
    print(f"=======================================================")

    async with websockets.connect('ws://localhost:8000/ws/simulate', max_size=None) as ws:
        await ws.send(json.dumps(config))
        packets_by_policy = {'fifo': [], 'spq': [], 'wfq': [], 'drr': []}
        final_results = None

        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=60)
            msg = json.loads(raw)
            mtype = msg.get('type')

            if mtype == 'packets_chunk':
                pol = msg['policy']
                if pol in packets_by_policy:
                    packets_by_policy[pol].extend(msg['packets'])

            elif mtype == 'results':
                final_results = msg
                break

        assert final_results is not None, "Did not receive final results message!"

        for pol in ['fifo', 'spq', 'wfq', 'drr']:
            m = final_results[pol]
            gen = m['generated']
            deliv = m['delivered']
            drop = m['dropped']

            # Count reconciliation invariant: gen == delivered + dropped
            assert gen == deliv + drop, f"[{pol.upper()}] Count mismatch: gen({gen}) != deliv({deliv}) + drop({drop})"
            assert len(packets_by_policy[pol]) == gen, (
                f"[{pol.upper()}] Packet trace size {len(packets_by_policy[pol])} != generated {gen}"
            )

            # Invariant: Metrics in reasonable ranges
            assert 0.0 <= m['drop_rate_pct'] <= 100.0, f"[{pol.upper()}] Invalid drop rate: {m['drop_rate_pct']}"
            assert 0.0 <= m['link_utilization_pct'] <= 100.0, f"[{pol.upper()}] Invalid utilization: {m['link_utilization_pct']}"

            voice_delay = m['per_class']['voice']['avg_e2e_delay_ms']
            file_delay = m['per_class']['file']['avg_e2e_delay_ms']
            voice_drops = m['per_class']['voice']['dropped']
            file_drops = m['per_class']['file']['dropped']

            print(
                f"  [{pol.upper():4s}] Delivered: {deliv:4d} | Dropped: {drop:3d} ({m['drop_rate_pct']:4.1f}%) | "
                f"Voice Delay: {voice_delay if voice_delay is not None else 0:5.2f}ms | "
                f"File Delay: {file_delay if file_delay is not None else 0:5.2f}ms"
            )

        # Policy-specific checks under congestion
        if profile in ['congested', 'heavy']:
            spq_voice = final_results['spq']['per_class']['voice']['avg_e2e_delay_ms']
            fifo_voice = final_results['fifo']['per_class']['voice']['avg_e2e_delay_ms']
            if spq_voice is not None and fifo_voice is not None:
                assert spq_voice <= fifo_voice, f"Expected SPQ voice delay ({spq_voice}) <= FIFO ({fifo_voice})"

        # Drop policy checks
        if drop_policy == 'push_out' and profile in ['congested', 'heavy']:
            for pol in ['spq', 'wfq', 'drr']:
                voice_drops = final_results[pol]['per_class']['voice']['dropped']
                print(f"  [PUSH-OUT {pol.upper()}] Voice drops: {voice_drops} (Priority eviction protecting voice)")
                # Under push-out, voice is highest priority, should suffer 0 or near 0 drops
                assert voice_drops == 0, f"Expected 0 voice drops under push-out in {pol}, got {voice_drops}"

        print(f"  --> PASSED: Profile={profile.upper()}, DropPolicy={drop_policy.upper()}")

async def main():
    print(">>> Starting Full Verification of All Schedulers & Drop Policies <<<")
    # Test all 4 load profiles with default tail_drop
    for profile in ['low', 'near_capacity', 'congested', 'heavy']:
        await run_scenario_test(profile, drop_policy='tail_drop', duration_ms=2000)

    # Test push_out and wred under congested load
    await run_scenario_test('congested', drop_policy='push_out', duration_ms=2000)
    await run_scenario_test('congested', drop_policy='wred', duration_ms=2000)

    print("\n>>> ALL VERIFICATION TESTS PASSED PERFECTLY! <<<")

if __name__ == '__main__':
    asyncio.run(main())
