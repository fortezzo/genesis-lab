// Genesis Lab - every tunable number, each with a comment.
// Balancing the world means editing numbers here, not rewriting code.
// The world is a round glass lab terrarium seen from directly above.
// Units: distances are "units" (1 unit = 0.1 mm on the scale bar, so the
// terrarium is 40 cm across), times are simulated seconds unless a comment says otherwise.
//
// Balance notes (found with tools/headless.html). The foraging test compares
// minute 1 with minute 10, so minute 1 must measure random brains fairly:
//  - A sparse start (sproutStart) and slow primitive walkers: random brains must really find food.
//  - thrustDeadZone: a random brain often rests instead of bumping into food by luck.
//  - Primitives arrive with a full tank (startEnergy) but must settle (primitiveSettleTime)
//    before breeding, so minute 1 isn't one lucky family multiplying.
//  - reproduceCooldown: without it, parents churn out doomed babies and most creatures live ~20 s.
//  - More sprouts are not better: above sproutGrowthRate ~26, random walkers find food by luck
//    and the improvement shrinks.
//  - Terrarium switch: the air is still (no currents) and bugs walk, so they stop quickly
//    (walkBraking) and never slide sideways (legGrip). Nothing drifts a newcomer into food any
//    more, so primitives now arrive with a completely full tank (startEnergy 1.0).
var GL = GL || {};

GL.Config = {
  // ------------------------------------------------------------------ time
  ticksPerSecond: 60,        // fixed simulation steps per simulated second
  defaultSpeed: 2,           // speed the app starts at (2x = 2 ticks per drawn frame)
  speedOptions: [1, 2, 4, 16, 'max'], // speed buttons, besides pause
  frameSimBudgetMs: 12,      // most milliseconds of simulation per drawn frame (Max speed uses all of it)
  maxFrameGapSec: 0.1,       // longest real-time gap between frames we try to catch up on

  // ------------------------------------------------------------- terrarium
  terrariumRadius: 2000,     // the terrarium floor is a circle this big (4,000 units = 40 cm across)
  wallEnergyCost: 3.0,       // extra energy per second burned while pressed against the glass wall
  mmPerUnit: 0.1,            // scale bar: one unit is this many millimetres
  // There are no currents: the air is still, food stays where it grows and creatures only walk.

  // ------------------------------------------------- heat lamps over nutrient pads
  lampCount: 4,              // heat lamps shining on nutrient pads
  lampMinOrbit: 0.25,        // closest a lamp drifts to the centre, as a fraction of the terrarium radius
  lampMaxOrbit: 0.70,        // farthest a lamp drifts from the centre, as a fraction of the terrarium radius
  lampOrbitSpeed: 0.010,     // how fast lamps circle the terrarium, radians per second (about 10 minutes per lap)
  lampWanderSpeed: 0.004,    // how fast each lamp's distance from the centre wanders in and out
  lampSpread: 700,           // sprouts grow in a patch around each lamp, about this wide (units)
  lampStrengthMin: 0.6,      // a lamp's growth strength slowly wanders between this...
  lampStrengthMax: 1.4,      // ...and this, so feeding grounds wax and wane

  // --------------------------------------------------------------- sprouts
  sproutMax: 1500,           // most sprouts in the terrarium at once
  sproutStart: 60,           // sprouts when a world begins (a sparse start, so random brains are put to the test)
  sproutGrowthRate: 26,      // new sprouts per second when the terrarium is bare; slows as it fills up
  sproutOpenGroundChance: 0.2, // share of new sprouts that come up on open soil instead of under a lamp
  sproutEnergy: 25,          // energy in one sprout
  sproutRadius: 4,           // size of a sprout, for eating
  sproutMaxAge: 120,         // a sprout withers after this many seconds if nobody eats it

  // ------------------------------------------------------------ population
  startCreatures: 60,        // random creatures in a new world
  populationFloor: 20,       // below this many creatures, new primitive ones wander in
  floorSpawnInterval: 0.25,  // seconds between newcomers while below the floor
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
  meatEating: false,         // plant-eaters only until Session 3, so the diet gene is held at 0

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
  walkCost: 0.000017,        // energy per second for walking, x speed squared x size
  eyeCost: 0.0005,           // energy per second for eyes, x sight range x field of view (radians)
  thinkCost: 0.3,            // energy per second for running the brain
  turnCost: 0.03,            // energy per second for turning at full turn rate
  startEnergy: 1.0,          // primitive creatures start with this share of their max energy. A full tank:
                             // in still air nothing drifts them into food, so they need fuel to walk to a
                             // feeding ground (0.9 in the ocean version; 1.0 halved early population crashes)
  primitiveSettleTime: 30,   // primitive creatures must wait this many seconds after arriving before having a baby
  primitiveAgeSpread: 20,    // primitive creatures arrive fully grown, with ages spread over this many extra seconds
  sizeSenseScale: 1.5,       // how sharply a creature senses size differences (higher = small differences feel bigger)

  // ------------------------------------------------------------ body and legs
  refSize: 10,               // the "normal" body size used by the size penalties below
  sizeSpeedPenalty: 0.35,    // bigger bodies are slower: top speed x (refSize / size) ^ this
  walkAcceleration: 5,       // how quickly a bug speeds up to the walking speed it wants (per second)
  walkBraking: 14,           // how quickly it slows down when it walks slower or stops (per second): legs stop
                             // a bug in about a fifth of a second, where the old swimmers glided on
  legGrip: 14,               // how quickly legs cancel any sideways slide (per second), so turns don't skid
  thrustDeadZone: 0.3,       // the brain's thrust output (-1..1) must pass this to walk at all; -1 = always some thrust
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
    navyEdge: '#050B18',     // background at the edges (the lab bench in the dark)
    navyCenter: '#0A1630',   // background at the centre
    cyan: '#22E5FF',         // plant-eaters, main accent
    green: '#39FF88',        // good news in the interface (rising foraging skill)
    sprout: '#66DD4F',       // sprouts: leaf green, kept well apart from the cyan-to-blue bugs
    magenta: '#FF3D6E',      // meat-eaters, danger
    amber: '#FFB020',        // meat, warnings
    lamp: '#FFB46A',         // the warm light of the heat lamps
    soilDark: '#090B12',     // soil in the shadows and cracks
    soil: '#131620',         // soil: dark earth tinted toward the navy palette
    soilLight: '#1D202A',    // soil clumps catching a little light
    mossDark: '#0C1A1E',     // moss in shadow
    moss: '#132628',         // moss: deep green tinted toward navy
    mossLight: '#1C3433',    // moss tips
    padRich: '#2A1A14',      // the rich, dark nutrient pad under each heat lamp
    text: '#CFE8FF',         // main text
    textDim: '#6E87A8',      // secondary text
    panelLine: 'rgba(140, 200, 255, 0.15)' // panel borders
  },
  plantHueMin: 182,          // plant-eater family colours range from this hue (cyan)...
  plantHueMax: 212,          // ...to this hue (electric blue), in degrees. Green is kept for the sprouts.
  hueDrift: 1.5,             // a baby's colour shifts by up to this many degrees from its parent

  // ---------------------------------------------------------------- drawing
  render: {
    maxPixelRatio: 2,        // never draw at more than 2x screen sharpness (saves power on 4K/phones)
    zoomMinFactor: 0.75,     // furthest zoom-out, relative to "whole terrarium fits on screen"
    zoomMax: 6,              // closest zoom-in, in screen pixels per unit
    startZoomFactor: 1.0,    // starting zoom, relative to "whole terrarium fits below the top bar" (1 = fits exactly)
    viewMarginPx: 14,        // gap kept around the terrarium when it fits the screen (below the top bar too)
    cameraEase: 6,           // how quickly the camera glides to its target (per second)
    wheelZoomStep: 1.15,     // zoom change per mouse-wheel notch
    clickSelectPx: 18,       // a click selects the nearest creature within this many screen pixels
    followZoom: 1.6,         // when you select a creature, zoom in to at least this many pixels per unit (less on small screens)

    // Bugs: bright cyan-to-blue, never confused with the dim green sprouts.
    creatureGlow: 3.0,       // bug glow size, x body radius
    creatureGlowAlpha: 0.8,  // bug glow brightness
    creatureGlowMinPx: 12,   // a bug's glow is never smaller than this on screen, so even babies read from afar
    creatureDotPx: 3.8,      // a bug too small to draw in detail becomes a white-hot dot this many pixels wide
    legDetailPx: 2.6,        // legs start to fade in once a bug's body radius is this many pixels on screen...
    legFullPx: 7,            // ...and are fully drawn from this size (so small bugs read as ovals, not spiky stars)
    detailPx: 3.5,           // eyes and antennae are drawn once a bug's body radius is this many pixels on screen
    legLength: 0.95,         // how far a leg reaches out from the body, x body radius
    legSwing: 0.45,          // how far each leg swings forward and back while walking (radians)
    legStride: 1.4,          // a bug travels this far per step cycle, x body radius (smaller = faster patter)
    legPatterMax: 34,        // fastest leg patter (radians per real second), so legs blur rather than flicker
    antennaLength: 0.8,      // antenna length, x body radius
    footprintEvery: 0.55,    // a footprint is left every time a bug walks this far, x body radius
    footprintMax: 18,        // footprints remembered per bug
    footprintLife: 2.4,      // seconds (real time) a footprint takes to fade away
    footprintAlpha: 0.3,     // footprint brightness
    footprintSize: 0.085,    // footprint dot radius, x body radius
    footprintMinZoom: 0.28,  // footprints are skipped when zoomed out further than this (pixels per unit)

    // Sprouts: smaller, dimmer and clearly green.
    sproutSize: 2.7,         // sprout drawing size (leaf tip to leaf tip), x sprout radius
    sproutGlow: 2.8,         // sprout glow size, x sprout radius
    sproutGlowAlpha: 0.34,   // sprout glow brightness, well below the bugs' glow
    sproutDotPx: 2.5,        // from far away a sprout is a faint green speck this many pixels wide
    sproutDotAlpha: 0.75,    // brightness of that speck (bugs are a brighter, bigger dot with a glow)
    sproutGrowTime: 2.5,     // seconds for a new sprout to grow to full size
    sproutSwaySpeed: 1.1,    // how fast sprouts sway (radians per real second)
    sproutSwayAmount: 0.07,  // how much they sway (share of their size)

    // The terrarium: soil, moss, glass and grid.
    soilTexturePx: 1280,     // the soil and moss are painted once into a texture this many pixels across
    mossCover: 0.3,          // roughly the share of the floor covered by moss patches
    grainTileUnits: 110,     // fine soil grain (seen when zoomed in) repeats every this many units
    grainAlpha: 0.75,        // strength of the fine soil grain
    grainZoomStart: 0.3,     // the fine grain starts to fade in at this zoom (pixels per unit)...
    grainZoomFull: 1.1,      // ...and is fully visible from this zoom
    glassThickness: 30,      // the glass wall's thickness (units)
    glassAlpha: 0.08,        // how strongly the glass wall catches the light
    glassHighlightAlpha: 0.3, // brightness of the soft highlight on the glass rim
    wallShadow: 0.07,        // the shadow where the wall meets the soil reaches this share of the radius inward
    wallShadowAlpha: 0.55,   // how dark that shadow gets at the wall
    benchShadowAlpha: 0.55,  // the terrarium's shadow on the lab bench around it
    lidSheenAlpha: 0.028,    // a faint diagonal reflection on the glass, like a lid catching the room light
    gridAlpha: 0.055,        // brightness of the measuring grid etched on the glass

    // Heat lamps: warm pools of light with a gentle shimmer, over darker nutrient pads.
    lampAlpha: 0.26,         // brightness of each lamp's broad warm pool of light
    lampCoreAlpha: 0.16,     // brightness of the hot centre of the pool
    lampPoolSize: 2.6,       // light pool width, x lampSpread
    padAlpha: 0.45,          // how strongly the dark, rich nutrient pad shows under each lamp
    padSize: 0.5,            // nutrient pad width, x lampSpread
    shimmerSpeed: 0.55,      // speed of the lamp shimmer
    shimmerAmount: 0.13,     // strength of the lamp shimmer (share of the light)

    // Dust motes floating in the lamp light, at two depths for parallax.
    motesFar: 160,           // small motes, low over the soil
    motesNear: 46,           // bigger, blurrier motes close to the glass
    motesFarParallax: 0.35,  // far motes move this much with the camera
    motesNearParallax: 1.6,  // near motes move this much with the camera
    moteDarkShare: 0.1,      // a mote outside the lamp light keeps only this share of its brightness

    // Effects.
    birthRingTime: 0.7,      // seconds a birth ring flash lasts
    deathParticles: 14,      // particles in a death burst
    deathParticleTime: 1.1,  // seconds a death particle lasts
    eatFlashTime: 0.35,      // seconds a creature glows brighter after eating
    maxParticles: 1600,      // the particle pool never grows past this
    lowFpsThreshold: 45,     // if the frame rate stays under this...
    lowFpsSeconds: 3,        // ...for this many seconds, footprints, particles and motes scale down
    scaleBarPx: 120          // the scale bar aims to be about this many pixels long
  }
};
