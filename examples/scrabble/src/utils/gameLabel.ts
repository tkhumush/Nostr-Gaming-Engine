const ADJECTIVES = [
  "Amber",
  "Arctic",
  "Azure",
  "Brass",
  "Bright",
  "Crimson",
  "Cosmic",
  "Dawn",
  "Echo",
  "Ember",
  "Frost",
  "Gilded",
  "Golden",
  "Harbor",
  "Hidden",
  "Indigo",
  "Ivory",
  "Jade",
  "Lunar",
  "Moss",
  "Nova",
  "Onyx",
  "Pearl",
  "Quartz",
  "Quiet",
  "Ruby",
  "Sable",
  "Solar",
  "Stone",
  "Umber",
  "Velvet",
  "Zephyr",
];

const NOUNS = [
  "Anchor",
  "Beacon",
  "Blossom",
  "Bridge",
  "Canyon",
  "Comet",
  "Drift",
  "Falcon",
  "Garden",
  "Harbor",
  "Horizon",
  "Inferno",
  "Lagoon",
  "Lantern",
  "Meadow",
  "Oracle",
  "Orbit",
  "Otter",
  "Prairie",
  "Pinnacle",
  "Quiver",
  "Ridge",
  "River",
  "Shadow",
  "Signal",
  "Summit",
  "Thicket",
  "Voyage",
  "Whisper",
  "Wildwood",
  "Willow",
  "Zephyr",
];

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const getGameLabel = (gameId: string): string => {
  const hash = hashString(gameId);
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[(hash >>> 8) % NOUNS.length];
  const code = hash.toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
  return `${adjective} ${noun} #${code}`;
};
