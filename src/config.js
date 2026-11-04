// All balance numbers live here so tuning never means hunting through systems.
export const CFG = {
  worldSize: 1100, // far past the charted 640, so the camera never finds an edge
  meshStep: 3,
  sdfCell: 0.8,
  sdfMax: 24,

  // Gear table. Index 0 is reverse, index 1 neutral: use GEAR_OFFSET to convert.
  gears: [
    { name: 'Astern', speed: -1.5, fuel: 0.085 },
    { name: 'Neutral', speed: 0, fuel: 0 },
    { name: 'Slow', speed: 2, fuel: 0.067 },
    { name: 'Cruise', speed: 3.5, fuel: 0.14 },
    { name: 'Half', speed: 5.5, fuel: 0.32 },
    { name: 'Full', speed: 8, fuel: 0.71 },
  ],
  gearOffset: 1,
  cruiseGear: 2,
  autopilotFuelFactor: 0.8, // autopilot is more efficient: design doc, page 2
  accel: 1.1,
  helmRate: 0.55, // how fast the wheel turns while A or D is held
  rudderRate: 0.7, // how fast the rudder follows the wheel
  brake: 2.2,
  turnRate: 0.62,
  yawLag: 1.2, // seconds for the hull's swing to catch up with the rudder
  dropMaxSpeed: 2.4, // scaled by the hull's speed, so gear 1 always qualifies
  tune: { burn: 1 },

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
  minDropPortDistance: 34,

  deckhandEfficiency: 0.75,
  minigameMin: 0.7,
  minigameMax: 1.3,

  crabPrice: 5,
  fuelPrice: 1,
  provisionPrice: 0.6,
  debtFloor: -150, // harbour credit: stops a broke player being stuck in port
  towBase: 60,
  towPerUnit: 0.25,
  towSpeed: 5,
  wagePerMinute: { captain: 1, deckhand: 0.5 }, // deliberately tiny: doc, page 7
  crewCost: { captain: 600, deckhand: 350 },
  crewInfo: {
    deckhand: {
      name: 'Tor Eriksen',
      role: 'Deckhand',
      blurb: 'Nine winters on the Barents crab grounds. Drops and hauls the cages for you, so you can leave the winch and get on with your day.',
    },
    captain: {
      name: 'Marit Nordvik',
      role: 'Captain',
      blurb: 'Reads a chart the way others read a menu. Sails your chained orders on autopilot at an economical gear, and turns for home before the tank runs dry.',
    },
  },
  cageWriteOff: 25,
  waypointReach: 7,

  // Every boat is named after a seabird of the far north. Refits add to these.
  ships: {
    auk: {
      name: 'Little Auk', kind: 'Inshore crabber', cost: 0,
      blurb: 'Left to you by an aunt who never once checked the weather. Small, thrifty and far tougher than it looks.',
      speed: 1, burn: 1, turn: 1, fuel: 60, provisions: 60, tank: 50, cages: 3, radar: 16,
      model: { length: 8, beam: 2.7, hull: '#b5362e', stripe: '#f3f4f2', tiers: 1, house: '#f2f4f3', roof: '#2f4650', crane: '#d7a436', mast: 1 },
    },
    kittiwake: {
      name: 'Kittiwake', kind: 'Coastal crabber', cost: 1100,
      blurb: 'A proper working boat with a bigger tank and a dry bunk. Quick on the helm, so it forgives a late turn around the ice.',
      speed: 1.12, burn: 0.95, turn: 1.1, fuel: 90, provisions: 85, tank: 85, cages: 5, radar: 20,
      model: { length: 9.5, beam: 3, hull: '#24606a', stripe: '#f3f4f2', tiers: 1, house: '#f2f4f3', roof: '#b5362e', crane: '#d7a436', mast: 2 },
    },
    fulmar: {
      name: 'Fulmar', kind: 'Offshore crabber', cost: 3200,
      blurb: 'Built to stay out for days. A long range and a deep tank let you work the grounds far beyond sight of town.',
      speed: 1.2, burn: 0.9, turn: 0.95, fuel: 150, provisions: 140, tank: 140, cages: 7, radar: 26,
      model: { length: 11.5, beam: 3.5, hull: '#2f4650', stripe: '#d7a436', tiers: 2, house: '#f2f4f3', roof: '#2f4650', crane: '#d7a436', mast: 2 },
    },
    petrel: {
      name: 'Storm Petrel', kind: 'Fast crabber', cost: 6500,
      blurb: 'Light hull, oversized engine. The fastest boat in the harbour, and it drinks fuel to prove it. Runs home ahead of any weather.',
      speed: 1.55, burn: 1.25, turn: 1.25, fuel: 170, provisions: 120, tank: 130, cages: 7, radar: 30,
      model: { length: 11, beam: 3, hull: '#e9ecec', stripe: '#b5362e', tiers: 2, house: '#2f4650', roof: '#e9ecec', crane: '#b5362e', mast: 1 },
    },
    skua: {
      name: 'Great Skua', kind: 'Factory crabber', cost: 14000,
      blurb: 'The flagship of the north coast. A deck stacked with cages, a tank like a swimming pool and a wheelhouse with its own coffee machine.',
      speed: 1.3, burn: 0.85, turn: 0.85, fuel: 260, provisions: 240, tank: 260, cages: 12, radar: 38,
      model: { length: 14, beam: 4.2, hull: '#a52d27', stripe: '#f3f4f2', tiers: 3, house: '#f2f4f3', roof: '#2f4650', crane: '#d7a436', mast: 2 },
    },
  },

  provisionRate: 0.035,
  noProvisionSpeed: 0.65,
  noProvisionEfficiency: 0.7,
  lowResource: 0.2,
  dockReach: 11,
  berthSpeed: 1.5, // top speed while coming alongside
  berthMinSpeed: 0.3,
  berthDecel: 1.1,
  berthTurn: 0.4, // radians per second

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
