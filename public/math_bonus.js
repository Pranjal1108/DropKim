const BonusMath = {
    RTP: 0.9600,
    // Higher volatility distribution
    tiers: [
        { name: "insane", multiplier: 100, probability: 0.0005 }, // 0.05% -> EV 0.05
        { name: "big", multiplier: 20, probability: 0.01 },       // 1.0%  -> EV 0.20
        { name: "medium", multiplier: 6, probability: 0.05 },     // 5.0%  -> EV 0.30
        { name: "small", multiplier: 2, probability: 0.205 },     // 20.5% -> EV 0.41
        { name: "lose", multiplier: 0, probability: 0.7345 }      // 73.45% -> EV 0.0
    ]
    // Sum Prob = 1.0000
    // Sum EV = 0.9600
};
