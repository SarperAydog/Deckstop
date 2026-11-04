// All balance numbers live here so tuning never means hunting through systems.
export const CFG = {
  worldSize: 640,
  sdfCell: 0.8,
  sdfMax: 24,

  // Gear table. Index 0 is reverse, index 1 neutral: use GEAR_OFFSET to convert.
  gears: [
    { name: 'Astern', speed: -2.5, fuel: 0.14 },
    { name: 'Neutral', speed: 0, fuel: 0 },
    { name: 'Slow', speed: 3, fuel: 0.1 },
    { name: 'Cruise', speed: 6, fuel: 0.24 },
    { name: 'Half', speed: 9, fuel: 0.52 },
    { name: 'Full', speed: 13, fuel: 1.15 },
  ],
  gearOffset: 1,
  cruiseGear: 2,
  autopilotFuelFactor: 0.8, // autopilot is more efficient: design doc, page 2
  accel: 3,
  brake: 7,
  turnRate: 1.15,

  soakPeak: 150, // seconds until a cage peaks
  escapeTime: 420, // seconds after the peak to reach the floor
  escapeFloor: 0.45,
  cageCapMin: 6,
  cageCapDensity: 22,
  dropDuration: 2.2,
  crewCollectDuration: 5,
  cageReach: 8,
  minCageSpacing: 7,
  minDropShoreDistance: 5,

  deckhandEfficiency: 0.75,
  minigameMin: 0.7,
  minigameMax: 1.3,

  crabPrice: 5,
  fuelPrice: 1,
  provisionPrice: 0.6,
  debtFloor: -150, // harbour credit: stops a broke player being stuck in port
  towBase: 60,
  towPerUnit: 0.25,
  towSpeed: 7,
  wagePerMinute: { captain: 1, deckhand: 0.5 }, // deliberately tiny: doc, page 7
  crewCost: { captain: 600, deckhand: 350 },

  provisionRate: 0.05,
  noProvisionSpeed: 0.65,
  noProvisionEfficiency: 0.7,
  lowResource: 0.2,
  dockReach: 11,

  stormBuildSeconds: 90,
  overcastAfterDismiss: 60,
  snoozeMinutes: 5,

  start: { money: 120, voyageMinutes: 25 },

  upgrades: {
    fuel: { label: 'Fuel tank', unit: 'fuel', values: [60, 90, 130, 180, 240], cost: [160, 380, 800, 1600] },
    provisions: { label: 'Provision storage', unit: 'rations', values: [60, 90, 130, 180, 240], cost: [120, 300, 650, 1300] },
    tank: { label: 'Crab tank', unit: 'crabs', values: [50, 80, 120, 170, 240], cost: [200, 450, 950, 1900] },
    cages: { label: 'Cages', unit: 'cages', values: [3, 4, 6, 8, 12], cost: [180, 420, 900, 1800] },
    radar: { label: 'Radar range', unit: 'm', values: [16, 24, 34, 46, 60], cost: [150, 360, 780, 1500] },
  },
};
