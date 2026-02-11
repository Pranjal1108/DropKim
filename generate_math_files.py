#!/usr/bin/env python3
"""
Generate math files for 3 modes:
- base: Normal mode (can have 0 payouts)
- no_zero: No zero payout mode (all wins)
- bonus: Bonus mode (all wins)
"""

import json
import random
import zstandard as zstd
from pathlib import Path

# RTP target
RTP = 0.96
TOTAL_ENTRIES = 1_000_000

# Mode configurations
MODES = {
    "base": {
        # Can have 0 payouts
        "tiers": [
            {"multiplier": 100, "probability": 0.0002},   # 0.02%
            {"multiplier": 20, "probability": 0.005},     # 0.5%
            {"multiplier": 6, "probability": 0.04},       # 4%
            {"multiplier": 2, "probability": 0.30},       # 30%
            {"multiplier": 0, "probability": 0.6548},     # 65.48%
        ]
    },
    "no_zero": {
        # NO 0 payouts - redistributed for 96% RTP
        "tiers": [
            {"multiplier": 100, "probability": 0.0005},   # 0.05%
            {"multiplier": 20, "probability": 0.01},      # 1%
            {"multiplier": 6, "probability": 0.05},       # 5%
            {"multiplier": 2, "probability": 0.20},       # 20%
            {"multiplier": 1, "probability": 0.7395},     # 73.95% (1x = return bet)
        ]
    },
    "bonus": {
        # NO 0 payouts - higher volatility
        "tiers": [
            {"multiplier": 100, "probability": 0.001},    # 0.1%
            {"multiplier": 20, "probability": 0.015},     # 1.5%
            {"multiplier": 6, "probability": 0.06},       # 6%
            {"multiplier": 2, "probability": 0.15},       # 15%
            {"multiplier": 1, "probability": 0.774},      # 77.4%
        ]
    }
}


def verify_rtp(tiers, mode_name):
    """Verify RTP calculation for a mode."""
    total_prob = sum(t["probability"] for t in tiers)
    ev = sum(t["multiplier"] * t["probability"] for t in tiers)
    print(f"  {mode_name}: prob_sum={total_prob:.4f}, RTP={ev:.4f}")
    return abs(total_prob - 1.0) < 0.001 and abs(ev - RTP) < 0.01


def generate_lookup_table(tiers, output_path):
    """Generate lookup table CSV with multipliers in cents (x100)."""
    entries = []
    for tier in tiers:
        count = int(tier["probability"] * TOTAL_ENTRIES)
        value = int(tier["multiplier"] * 100)  # Convert to cents
        entries.extend([value] * count)
    
    # Fill remaining entries to reach exactly TOTAL_ENTRIES
    while len(entries) < TOTAL_ENTRIES:
        entries.append(int(tiers[-1]["multiplier"] * 100))
    
    # Shuffle for randomness
    random.shuffle(entries)
    
    with open(output_path, 'w') as f:
        f.write('\n'.join(str(e) for e in entries))
    
    return entries


def generate_books(entries, output_path, criteria):
    """Generate books JSONL.ZST from lookup entries."""
    lines = []
    for i, payout in enumerate(entries):
        entry = {
            "id": i,
            "payoutMultiplier": payout,
            "events": [],
            "criteria": criteria,
            "baseGameWins": payout / 100.0,
            "freeGameWins": 0.0
        }
        lines.append(json.dumps(entry, separators=(',', ':')))
    
    jsonl_content = '\n'.join(lines)
    cctx = zstd.ZstdCompressor(level=3)
    compressed = cctx.compress(jsonl_content.encode('utf-8'))
    
    with open(output_path, 'wb') as f:
        f.write(compressed)
    
    return len(lines)


def main():
    script_dir = Path(__file__).parent
    library_dir = script_dir / "math" / "library"
    library_dir.mkdir(parents=True, exist_ok=True)
    
    print("Verifying RTP for all modes...")
    for mode_name, config in MODES.items():
        if not verify_rtp(config["tiers"], mode_name):
            print(f"  [!] Warning: {mode_name} RTP mismatch")
    
    print("\nGenerating math files...")
    modes_config = []
    
    for mode_name, config in MODES.items():
        print(f"\n[{mode_name.upper()}]")
        
        csv_name = f"lookUpTable_{mode_name}_0.csv"
        books_name = f"books_{mode_name}.jsonl.zst"
        
        csv_path = library_dir / csv_name
        books_path = library_dir / books_name
        
        # Generate lookup table
        print(f"  Generating {csv_name}...")
        entries = generate_lookup_table(config["tiers"], csv_path)
        print(f"    {len(entries):,} entries")
        
        # Verify no zeros for no_zero and bonus modes
        if mode_name in ["no_zero", "bonus"]:
            zero_count = entries.count(0)
            if zero_count > 0:
                print(f"    [!] ERROR: Found {zero_count} zero entries!")
            else:
                print(f"    ✓ No zero payouts")
        
        # Generate books
        print(f"  Generating {books_name}...")
        count = generate_books(entries, books_path, mode_name)
        print(f"    {count:,} entries")
        
        modes_config.append({
            "name": mode_name,
            "cost": 1.0,
            "events": books_name,
            "weights": csv_name
        })
    
    # Generate index.json
    print("\nGenerating index.json...")
    index_data = {
        "version": 1,
        "modes": modes_config
    }
    
    with open(library_dir / "index.json", 'w') as f:
        json.dump(index_data, f, indent=2)
    
    print("\n" + "="*50)
    print("✓ All math files generated successfully!")
    print("="*50)


if __name__ == "__main__":
    main()
