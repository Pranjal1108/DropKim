const BonusMath = {
    RTP: 0.9600,
    // NO 0 payouts - higher volatility (from generate_math_files.py)
    tiers: [
        { name: "insane", multiplier: 100, probability: 0.001 },    // 0.1%
        { name: "big", multiplier: 20, probability: 0.015 },        // 1.5%
        { name: "medium", multiplier: 6, probability: 0.06 },       // 6.0%
        { name: "small", multiplier: 2, probability: 0.15 },        // 15.0%
        { name: "tiny", multiplier: 1, probability: 0.774 }         // 77.4%
    ]
    // Sum Prob = 1.0000
    // Sum EV = 0.9600
};

