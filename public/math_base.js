const BaseMath = {
    RTP: 0.9600,
    // Tiers must be ordered from rarest to most common for current logic, 
    // or logic will need to handle cumulative probabilities accurately.
    // We will use a cumulative table in script.js.
    tiers: [
        { name: "insane", multiplier: 100, probability: 0.0002 }, // 0.02% -> EV 0.02
        { name: "big", multiplier: 20, probability: 0.005 },      // 0.5%  -> EV 0.10
        { name: "medium", multiplier: 6, probability: 0.04 },     // 4.0%  -> EV 0.24
        { name: "small", multiplier: 2, probability: 0.30 },      // 30.0% -> EV 0.60
        { name: "lose", multiplier: 0, probability: 0.6548 }      // 65.48% -> EV 0.0
    ]
    // Sum Prob = 1.0000
    // Sum EV = 0.9600
};
