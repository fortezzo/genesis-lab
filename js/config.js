// Genesis Lab - every tunable number, each with a comment.
// Balancing the world means editing numbers here, not rewriting code.
// Units: distances are "units" (1 unit = 1 micrometre on the scale bar),
// times are simulated seconds unless a comment says otherwise.
//
// Balance notes (Session 1, found with tools/headless.html). The foraging test
// compares minute 1 with minute 10, so minute 1 must measure random brains fairly:
//  - A sparse start (algaeStart) and slow primitive swimmers: random brains must really find food.
//  - thrustDeadZone: a random brain often rests instead of bumping into food by luck.
//  - Primitives arrive with a full tank (startEnergy) but must settle (primitiveSettleTime)
//    before breeding, so minute 1 isn't one lucky family multiplying.
//  - reproduceCooldown: without it, parents churn out doomed babies and most creatures live ~20 s.
//  - More algae is not better: above algaeGrowthRate ~26, random swimmers find food by luck
//    and the improvement shrinks.
var GL = GL || {};

GL.Config = {
  // ------------------------------------------------------------------ time
  ticksPerSecond: 60,        // fixed simulation steps per simulated second
  defaultSpeed: 2,           // speed the app starts at (2x = 2 ticks per drawn frame)
  speedOptions: [1, 2, 4, 16, 'max'], // speed buttons, besides pause
  frameSimBudgetMs: 12,      // most milliseconds of simulation per drawn frame (Max speed uses all of it)
  maxFrameGapSec: 0.1,       // longest real-time gap between frames we try to catch up on

  // ------------------------------------------------------------------ dish
  dishRadius: 2000,          // the culture dish is a circle this big (4,000 units across)
  wallEnergyCost: 3.0,       // extra energy per second burned while pressed against the dish edge

  // -------------------------------------------------------------- currents
  currentStrength: 12,       // typical speed of the swirling water, units per second
  currentScale: 1100,        // width of one swirl, in units (bigger = broader, lazier swirls)
  currentTimeScale: 0.015,   // how fast the swirl pattern itself changes over time
  currentGridSize: 33,       // the current is sampled on a grid this many points across (then smoothed)
  currentUpdateTicks: 15,    // recompute the current grid every this many ticks
  currentWallFade: 220,      // the current fades to nothing this close to the dish edge
  currentOnCreatures: 0.5,   // how much the current pushes creatures (0 = not at all, 1 = fully)
  currentOnAlgae: 1.0,       // how much the current carries algae

  // ----------------------------------------------------------------- vents
  ventCount: 4,              // nutrient vents in the dish
  ventMinOrbit: 0.25,        // closest a vent drifts to the centre, as a fraction of the dish radius
  ventMaxOrbit: 0.70,        // farthest a vent drifts from the centre, as a fraction of the dish radius
  ventOrbitSpeed: 0.010,     // how fast vents circle the dish, radians per second (about 10 minutes per lap)
  ventWanderSpeed: 0.004,    // how fast each vent's distance from the centre wanders in and out
  ventSpread: 700,           // algae grows in a cloud around each vent, about this wide (units)
  ventStrengthMin: 0.6,      // a vent's growth strength slowly wanders between this...
  ventStrengthMax: 1.4,      // ...and this, so feeding grounds wax and wane

  // ----------------------------------------------------------------- algae
  algaeMax: 1500,            // most algae pieces in the dish at once
  algaeStart: 60,            // algae pieces when a world begins (a sparse start, so random brains are put to the test)
  algaeGrowthRate: 26,       // new pieces per second when the dish is empty; slows as it fills up
  algaeOpenWaterChance: 0.2, // share of new algae that appears in open water instead of near a vent
  algaeEnergy: 25,           // energy in one piece of algae
  algaeRadius: 4,            // size of an algae piece, for eating
  algaeMaxAge: 120,          // algae fades away after this many seconds if nobody eats it

  // ------------------------------------------------------------ population
  startCreatures: 60,        // random creatures in a new world
  populationFloor: 20,       // below this many creatures, new primitive ones drift in
  floorSpawnInterval: 0.25,  // seconds between drift-in arrivals while below the floor
  capLaptop: 400,            // most creatures alive at once on a laptop or desktop
  capPhone: 150,             // most creatures alive at once on a phone

  // ----------------------------------------------------------------- genes
  // min/max = the full range evolution can reach.
  // startMin/startMax = the range for brand-new "primitive" creatures.
  genes: [
    { key: 'size',     name: 'Size',            min: 6,    max: 24,  startMin: 8,    startMax: 13  }, // body radius in units
    { key: 'speed',    name: 'Top speed',       min: 30,   max: 150, startMin: 35,   startMax: 65  }, // units per second
    { key: 'turn',     name: 'Turn speed',      min: 1,    max: 6,   startMin: 1.5,  startMax: 4   }, // radians per second
    { key: 'sight',    name: 'Sight range',     min: 60,   max: 320, startMin: 120,  startMax: 220 }, // units
    { key: 'fov',      name: 'Field of view',   min: 60,   max: 300, startMin: 90,   startMax: 200 }, // degrees
    { key: 'diet',     name: 'Diet',            min: 0,    max: 1,   startMin: 0,    startMax: 0   }, // 0 = plants, 1 = meat
    { key: 'invest',   name: 'Baby investment', min: 0.2,  max: 0.6, startMin: 0.3,  startMax: 0.5 }, // share of energy given to a baby
    { key: 'mutation', name: 'Mutation rate',   min: 0.02, max: 0.3, startMin: 0.04, startMax: 0.12 }, // chance each DNA number changes
    { key: 'clock',    name: 'Clock speed',     min: 0.1,  max: 2,   startMin: 0.1,  startMax: 2   }  // inner rhythm, cycles per second
  ],
  meatEating: false,         // Session 1: plant-eaters only, so the diet gene is held at 0

  // ----------------------------------------------------------------- brain
  brainInputs: 25,           // senses (see PLAN.md section 5)
  brainHidden: 12,           // hidden neurons
  brainOutputs: 6,           // thrust, turn, bite, reproduce, memory 1, memory 2
  brainInitSpread: 0.9,      // how strong the random connections of a brand-new brain are
  brainLimit: 4,             // every brain number is kept between -4 and 4

  // -------------------------------------------------------------- mutation
  geneNudge: 0.10,           // a gene mutation usually shifts it by about this share of its range
  geneJumpChance: 0.01,      // ...but this often it jumps to a brand-new random value
  brainNudge: 0.3,           // a brain-number mutation usually shifts it by about this much
  brainResetChance: 0.005,   // ...but this often it becomes a fresh random value

  // ---------------------------------------------------------------- energy
  energyPerSize2: 1.0,       // max energy = this x size squared (size 10 holds 100 energy)
  upkeepPerSize2: 0.008,     // energy per second just to stay alive, x size squared
  swimCost: 0.000017,        // energy per second for swimming, x speed squared x size
  eyeCost: 0.0005,           // energy per second for eyes, x sight range x field of view (radians)
  thinkCost: 0.3,            // energy per second for running the brain
  turnCost: 0.03,            // energy per second for turning at full turn rate
  startEnergy: 0.9,          // primitive creatures start with this share of their max energy
  primitiveSettleTime: 30,   // primitive creatures must wait this many seconds after arriving before having a baby
  primitiveAgeSpread: 20,    // primitive creatures arrive fully grown, with ages spread over this many extra seconds
  sizeSenseScale: 1.5,       // how sharply a creature senses size differences (higher = small differences feel bigger)

  // ------------------------------------------------------------------ body
  refSize: 10,               // the "normal" body size used by the size penalties below
  sizeSpeedPenalty: 0.35,    // bigger bodies are slower: top speed x (refSize / size) ^ this
  acceleration: 5,           // how quickly a creature reaches the speed it wants (per second)
  thrustDeadZone: 0.3,       // the brain's thrust output (-1..1) must pass this to swim at all; -1 = always some thrust
  healthPerSize2: 1.0,       // max health = this x size squared
  healRate: 0.02,            // share of max health regrown per second
  healEnergyCost: 0.5,       // energy spent per point of health regrown

  // ------------------------------------------------------------ life cycle
  lifespan: 240,             // natural lifespan in seconds (4 minutes)
  oldAgeStart: 0.7,          // past this share of the lifespan, upkeep starts to climb
  oldAgeUpkeep: 8,           // at the end of the lifespan, upkeep is this many times higher (plus 1)
  maxAgeFactor: 1.25,        // nobody lives past lifespan x this
  maturityAge: 10,           // a creature must be this many seconds old to have a baby
  growTime: 10,              // seconds for a baby to grow from half size to full size
  babyStartScale: 0.5,       // babies are born at this share of their full size
  reproduceThreshold: 0.6,   // a creature needs more than this share of max energy to have a baby
  birthCost: 0.10,           // the parent also loses this share of its energy as the cost of birth
  reproduceCooldown: 20,     // after having a baby, a parent must wait this many seconds before the next one

  // ----------------------------------------------------------------- stats
  statsIntervalTicks: 30,    // sample statistics every this many ticks (half a simulated second)
  skillWindowSec: 60,        // foraging skill is measured over the last this many seconds
  statsHistoryMax: 7200,     // samples kept for charts (1 hour at 2 per second)

  // ------------------------------------------------------------ spatial grid
  gridCellSize: 160,         // neighbours are found using a grid of cells this big (units)

  // ---------------------------------------------------------------- colours
  colors: {
    navyEdge: '#050B18',     // background at the edges
    navyCenter: '#0A1630',   // background at the centre
    cyan: '#22E5FF',         // plant-eaters, main accent
    green: '#39FF88',        // algae, growth
    magenta: '#FF3D6E',      // meat-eaters, danger
    amber: '#FFB020',        // meat, warnings
    text: '#CFE8FF',         // main text
    textDim: '#6E87A8',      // secondary text
    panelLine: 'rgba(140, 200, 255, 0.15)' // panel borders
  },
  plantHueMin: 150,          // plant-eater family colours range from this hue (green-cyan)...
  plantHueMax: 192,          // ...to this hue (cyan), in degrees
  hueDrift: 1.5,             // a baby's colour shifts by up to this many degrees from its parent

  // ---------------------------------------------------------------- drawing
  render: {
    maxPixelRatio: 2,        // never draw at more than 2x screen sharpness (saves power on 4K/phones)
    zoomMinFactor: 0.75,     // furthest zoom-out, relative to "whole dish fits the screen"
    zoomMax: 6,              // closest zoom-in, in screen pixels per unit
    startZoomFactor: 1.15,   // starting zoom, relative to "whole dish fits the screen"
    cameraEase: 6,           // how quickly the camera glides to its target (per second)
    wheelZoomStep: 1.15,     // zoom change per mouse-wheel notch
    clickSelectPx: 18,       // a click selects the nearest creature within this many screen pixels
    followZoom: 1.6,         // when you select a creature, zoom in to at least this many pixels per unit (less on small screens)
    creatureGlow: 3.4,       // creature glow size, x body radius
    creatureGlowAlpha: 0.8,  // creature glow brightness
    creatureGlowMinPx: 11,   // a creature's glow is never smaller than this on screen, so it reads from afar
    algaeGlow: 3.0,          // algae glow size, x algae radius
    algaeGlowAlpha: 0.75,    // algae glow brightness
    algaeBreathSpeed: 1.4,   // algae pulse speed (radians per real second)
    algaeBreathAmount: 0.18, // algae pulse strength
    trailPoints: 10,         // how many past positions make up a light trail
    trailSpacing: 6,         // a new trail point is added after moving this many units
    trailAlpha: 0.24,        // trail brightness
    trailWidth: 3,           // trail thickness in units (at the newest end)...
    trailMaxPx: 2.2,         // ...but never thicker than this many screen pixels
    tailLength: 1.6,         // tail (flagellum) length, x body radius
    tailWaveMin: 3,          // tail wave speed when still (radians per second)
    tailWaveMax: 22,         // tail wave speed at full speed
    detailPx: 3.5,           // eyes and tails are drawn once a body's radius is this many pixels on screen
    dustFar: 140,            // far dust specks
    dustNear: 50,            // near dust specks (bigger, blurrier, move more)
    dustFarParallax: 0.35,   // far dust moves this much with the camera
    dustNearParallax: 1.6,   // near dust moves this much with the camera
    causticsAlpha: 0.065,    // brightness of the moving light patterns
    causticsTile: 1100,      // size of one caustics tile, in units
    causticsSpeed: 9,        // how fast the light patterns drift (units per second)
    ventAlpha: 0.10,         // brightness of the vent clouds
    reticleAlpha: 0.06,      // brightness of the microscope grid lines
    birthRingTime: 0.7,      // seconds a birth ring flash lasts
    deathParticles: 14,      // particles in a death burst
    deathParticleTime: 1.1,  // seconds a death particle lasts
    eatFlashTime: 0.35,      // seconds a creature glows brighter after eating
    maxParticles: 1600,      // the particle pool never grows past this
    lowFpsThreshold: 45,     // if the frame rate stays under this...
    lowFpsSeconds: 3,        // ...for this many seconds, trails and particles scale down
    scaleBarPx: 120          // the microscope scale bar aims to be about this many pixels long
  }
};
