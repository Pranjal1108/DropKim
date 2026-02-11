import random

# Updated Math objects based on JS files
BaseMath = {
    "tiers": [
        { "name": "insane", "multiplier": 100, "probability": 0.0002 },
        { "name": "big", "multiplier": 20, "probability": 0.005 },
        { "name": "medium", "multiplier": 6, "probability": 0.04 },
        { "name": "small", "multiplier": 2, "probability": 0.30 },
        { "name": "lose", "multiplier": 0, "probability": 0.6548 }
    ]
}

BonusMath = {
    "tiers": [
        { "name": "insane", "multiplier": 100, "probability": 0.001 },
        { "name": "big", "multiplier": 20, "probability": 0.015 },
        { "name": "medium", "multiplier": 6, "probability": 0.06 },
        { "name": "small", "multiplier": 2, "probability": 0.15 },
        { "name": "tiny", "multiplier": 1, "probability": 0.774 }
    ]
}

NoZeroMath = {
    "tiers": [
        { "name": "insane", "multiplier": 100, "probability": 0.0005 },
        { "name": "big", "multiplier": 20, "probability": 0.01 },
        { "name": "medium", "multiplier": 6, "probability": 0.05 },
        { "name": "small", "multiplier": 2, "probability": 0.20 },
        { "name": "tiny", "multiplier": 1, "probability": 0.7395 }
    ]
}

def decide_outcome(mode, no_zero_mode, chaos_mode):
    # New logic from script.js
    math = BaseMath
    if chaos_mode:
        math = BonusMath
    elif no_zero_mode:
        math = NoZeroMath
    
    r = random.random()
    cumulative = 0
    outcome_type = "lose" # fallback
    multiplier = 0
    
    for tier in math["tiers"]:
        cumulative += tier["probability"]
        if r < cumulative:
            outcome_type = tier["name"]
            multiplier = tier["multiplier"]
            return outcome_type, multiplier
            
    return "lose", 0

# Simulation
print("Normal Mode (Base):")
losses = 0
runs = 10000
for _ in range(runs):
    type, mult = decide_outcome(mode="normal", no_zero_mode=False, chaos_mode=False)
    if mult == 0:
        losses += 1
print(f"Losses: {losses}/{runs} ({losses/runs*100:.2f}%)")

print("\nNo-Zero Mode:")
losses = 0
for _ in range(runs):
    type, mult = decide_outcome(mode="normal", no_zero_mode=True, chaos_mode=False)
    if mult == 0:
        losses += 1
print(f"Losses: {losses}/{runs} ({losses/runs*100:.2f}%)")

print("\nBonus Mode (Chaos):")
losses = 0
for _ in range(runs):
    type, mult = decide_outcome(mode="normal", no_zero_mode=False, chaos_mode=True)
    if mult == 0:
        losses += 1
print(f"Losses: {losses}/{runs} ({losses/runs*100:.2f}%)")
