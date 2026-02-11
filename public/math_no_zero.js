const NoZeroMath = {
    RTP: 0.9600,
    // NO 0 payouts - redistributed for 96% RTP (from generate_math_files.py)
    tiers: [
        { name: "insane", multiplier: 100, probability: 0.0005 },   // 0.05%
        { name: "big", multiplier: 20, probability: 0.01 },         // 1.0%
        { name: "medium", multiplier: 6, probability: 0.05 },       // 5.0%
        { name: "small", multiplier: 2, probability: 0.20 },        // 20.0%
        { name: "tiny", multiplier: 1, probability: 0.7395 }        // 73.95% (1x = return bet)
    ]
    // Sum Prob = 1.0000
    // Sum EV = 0.9600
};
