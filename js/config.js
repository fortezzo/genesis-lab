// Genesis Lab - every tunable number, each with a comment.
// Balancing the world means editing numbers here, not rewriting code.
// The world is a round glass lab terrarium seen from directly above.
// Units: distances are "units" (1 unit = 0.1 mm on the scale bar, so the
// terrarium is 40 cm across), times are simulated seconds unless a comment says otherwise.
//
// Balance notes (found with tools/headless.html and 20-world sweeps; see PLAN.md section 10).
// The foraging test compares minute 1 with minute 10, so minute 1 must measure random brains fairly:
//  - Foraging skill is "times faster than random brains": real bugs against invisible random-brain
//    ghosts in the same spots at the same moment (js/sim/world.js and stats.js), so food
//    shortages and crowding can't inflate or drag down the learning proof.
//  - thrustDeadZone: a random brain often rests instead of bumping into food by luck.
//  - Primitives arrive with a full tank (startEnergy) but must settle (primitiveSettleTime)
//    before breeding, so minute 1 isn't one lucky family multiplying.
//  - reproduceCooldown: without it, parents churn out doomed babies.
//  - Terrarium switch: the air is still (no currents) and bugs walk, so they stop quickly
//    (walkBraking) and never slide sideways (legGrip).
//  - Terrarium feedback round (lifespan, steering, early game):
//    foodSenseGain makes steering evolve (mutation alone could hardly find it);
//    energyPerSize2, reproduceThreshold, eatOnlyWithRoom and sproutGrowthRate keep adults alive
//    long enough to follow; startCreatures keeps the start lively; turnCost discourages endless
//    circling; capBestFed keeps evolution going once the terrarium is full.
//  - Fair proof and speed trade-off: agilitySpeed/agilityExp make long fast legs clumsy, so top
//    speed is no longer a free upgrade; sproutGrowthFollowsLamps and the wider lamp strength range
//    give the population real ups and downs.
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
  eatOnlyWithRoom: true,     // a bug only eats a sprout it has room for. Nearly full bugs used to graze and waste
                             // most of each sprout, stripping the terrarium; this roughly halved unfed babies
  mmPerUnit: 0.1,            // scale bar: one unit is this many millimetres
  // There are no currents: the air is still, food stays where it grows and creatures only walk.

  // ------------------------------------------------- heat lamps over nutrient pads
  lampCount: 4,              // heat lamps shining on nutrient pads
  lampMinOrbit: 0.25,        // closest a lamp drifts to the centre, as a fraction of the terrarium radius
  lampMaxOrbit: 0.70,        // farthest a lamp drifts from the centre, as a fraction of the terrarium radius
  lampOrbitSpeed: 0.010,     // how fast lamps circle the terrarium, radians per second (about 10 minutes per lap)
  lampWanderSpeed: 0.004,    // how fast each lamp's distance from the centre wanders in and out
  lampSpread: 700,           // sprouts grow in a patch around each lamp, about this wide (units)
  lampStrengthMin: 0.4,      // a lamp's growth strength slowly wanders between this...
  lampStrengthMax: 1.6,      // ...and this, so feeding grounds wax and wane (was 0.6-1.4)
  sproutGrowthFollowsLamps: true, // total sprout growth rises and falls with the lamps' average brightness, so the
                             // whole terrarium has richer and leaner spells and the population booms and dips
                             // instead of sitting flat at the cap

  // --------------------------------------------------------------- sprouts
  sproutMax: 1500,           // most sprouts in the terrarium at once
  sproutStart: 60,           // sprouts when a world begins (a sparse start, so random brains are put to the test)
  sproutGrowthRate: 32,      // new sprouts per second when the terrarium is bare (at average lamp brightness);
                             // slows as it fills up. Was 34 before the speed trade-off; slower bugs need less food
  sproutOpenGroundChance: 0.2, // share of new sprouts that come up on open soil instead of under a lamp
  sproutEnergy: 25,          // energy in one sprout
  sproutRadius: 4,           // size of a sprout, for eating
  sproutMaxAge: 120,         // a sprout withers after this many seconds if nobody eats it

  // ------------------------------------------------------------ population
  startCreatures: 90,        // random creatures in a new world (was 60: the start dipped to ~20 bugs in many worlds)
  populationFloor: 20,       // below this many creatures, new primitive ones wander in
  floorSpawnInterval: 0.25,  // seconds between newcomers while below the floor
  capLaptop: 400,            // most creatures alive at once on a laptop or desktop
  capPhone: 150,             // most creatures alive at once on a phone
  capBestFed: true,          // when the terrarium is full, each free place goes to the best-fed creature that
                             // wants a baby, so good foragers still win once the population stops growing

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
  energyPerSize2: 1.6,       // max energy = this x size squared (size 10 holds 160 energy, about 90 s of life).
                             // Was 1.0: a bigger tank rides out gaps between meals, so adults live longer
  upkeepPerSize2: 0.008,     // energy per second just to stay alive, x size squared
  walkCost: 0.000017,        // energy per second for walking, x speed squared x size
  eyeCost: 0.0005,           // energy per second for eyes, x sight range x field of view (radians)
  thinkCost: 0.3,            // energy per second for running the brain
  agilitySpeed: 70,          // long legs built for speed are clumsy: a bug with a top speed above this turns
  agilityExp: 1.5,           // more slowly, by (agilitySpeed / top speed) to this power (at 140: 35% of its turn
                             // gene). Without it, top speed was a free upgrade (it costs nothing until used) and
                             // climbed to the 150 ceiling in every world. Energy costs for leg muscles were tried
                             // too, but they had to be so high to stop the race that adults starved younger
  turnCost: 0.3,             // energy per second for turning at full turn rate (was 0.03: legs work harder to
                             // turn, so walking in endless circles costs something and steering pays)
  startEnergy: 1.0,          // primitive creatures start with this share of their max energy. A full tank:
                             // in still air nothing drifts them into food, so they need fuel to walk to a
                             // feeding ground (0.9 in the ocean version; 1.0 halved early population crashes)
  primitiveSettleTime: 30,   // primitive creatures must wait this many seconds after arriving before having a baby
  primitiveAgeSpread: 20,    // primitive creatures arrive fully grown, with ages spread over this many extra seconds
  sizeSenseScale: 1.5,       // how sharply a creature senses size differences (higher = small differences feel bigger)
  foodSenseGain: 8,          // how strongly the food senses speak to the brain (food inputs run from 0 to this).
                             // At 1, a newborn brain barely reacts to food and mutation needed dozens of lucky
                             // steps to build steering. At 8, random brains already react strongly (half turn
                             // toward food, half away) and evolution only has to pick the right half

  // ------------------------------------------------------------ body and legs
  refSize: 10,               // the "normal" body size used by the size penalties below
  sizeSpeedPenalty: 0,       // bigger bodies are slower: top speed x (refSize / size) ^ this. 0 for walkers:
                             // longer legs make up for a heavier body (the old swimmers used 0.35)
  walkAcceleration: 5,       // how quickly a bug speeds up to the walking speed it wants (per second)
  walkBraking: 14,           // how quickly it slows down when it walks slower or stops (per second): legs stop
                             // a bug in about a fifth of a second, where the old swimmers glided on
  legGrip: 14,               // how quickly legs cancel any sideways slide (per second), so turns don't skid
  turnResponse: 10,          // how quickly the actual turn rate follows the brain's turn command (per second).
                             // Legs can't reverse a turn instantly, so bugs swing smoothly instead of twitching
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
  reproduceThreshold: 0.85,  // a creature needs more than this share of max energy to have a baby (was 0.6:
                             // parents now keep a reserve after giving birth, and babies start better fed)
  birthCost: 0.10,           // the parent also loses this share of its energy as the cost of birth
  reproduceCooldown: 20,     // after having a baby, a parent must wait this many seconds before the next one

  // ----------------------------------------------------------------- stats
  statsIntervalTicks: 30,    // sample statistics every this many ticks (half a simulated second)
  ghostCount: 64,            // invisible random-brain bugs measured alongside the real ones (fewer on phones)
  ghostLifetime: 60,         // each ghost walks for this many seconds, then becomes a fresh copy of another bug
  skillWindowSec: 60,        // foraging skill is measured over the last this many seconds
  steerConeDeg: 20,          // steering measure: a bug counts as pointed at the food it sees within this many degrees
  steerMinSpeed: 0.2,        // ...and as walking above this share of its top speed
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
    creatureMinBodyPx: 2.6,  // zoomed out, a bug's body is drawn with at least this radius on screen (pixels),
                             // so small evolved bugs still read as little glowing ovals, not dots
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
    soilFarTexturePx: 512,   // the softer whole-terrarium floor is painted at this size
    softMossEdge: 0.16,      // whole-terrarium view: how blurry the moss edges are (detailed floor: 0.07)
    softMossBlend: 0.5,      // ...and how strongly moss shows over the soil (detailed floor: 0.9)
    softMossZoomFull: 0.26,  // the soft floor is used fully when zoomed out beyond this (pixels per unit)...
    softMossZoomEnd: 0.5,    // ...and has faded into the detailed floor by this zoom
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
    qualityWarmupSeconds: 5, // the first seconds after loading are ignored (loading is always a little slow)
    qualityRecoverFps: 50,   // quality goes back up once the frame rate holds at or above this...
    qualityRecoverSeconds: 4, // ...for this many seconds (was 10 s above 57, so a laptop at 52-54 fps stayed on low)
    qualityBackoffMax: 60,   // if going back up makes it slow again at once, wait longer each time, up to this
    followNextSeconds: 6,    // when the followed bug dies, switch to its child or nearest relative after this
                             // many real seconds (unless the viewer chooses first)
    deathMarkSeconds: 10,    // the marker where the followed bug died fades out over this many seconds
    scaleBarPx: 120,         // the scale bar aims to be about this many pixels long
    viewConeAlpha: 0.10,     // the selected bug's field of view is drawn faintly on the soil, this bright...
    viewConeFoodAlpha: 0.22, // ...and each view slice that sees food lights up green by up to this much
    championMarkAlpha: 0.7,  // brightness of the small crown marker over the champion
    liteGlassBelowLevel: 1   // at a drawing quality below this (0 = low), panels drop their blur to save frame rate
  },

  // ------------------------------------------------------------- champion
  championBabyWeight: 3,     // champion score = babies x this + minutes alive (PLAN.md section 6)
  championMinuteWeight: 1,

  // ------------------------------------------------------------- lab log (the story engine, js/sim/story.js)
  story: {
    checkEverySec: 1,        // how often the story engine looks for news (simulated seconds)
    firstBoomPop: 150,       // the first boom is logged when the population first reaches this many bugs
    swingShare: 0.30,        // a boom or crash is logged when the population rises or falls by this share...
    swingMinBugs: 60,        // ...and by at least this many bugs, from its last low or high point
    recordMinAge: 180,       // a lifespan record is only news once a bug lived at least this many seconds...
    recordAgeStep: 10,       // ...and beat the old record by at least this many seconds (lives end by 5:00)
    recordMinBabies: 5,      // a babies record is news once a bug had at least this many babies
    recordGap: 45,           // at most one record line per this many simulated seconds (better ones wait their turn)
    generationMilestones: [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000], // generations worth a log line
    skillMilestones: [1.5, 2, 3, 4, 5, 6, 8, 10],   // foraging skill levels (x random brains) worth a log line
    skillFromSec: 120,       // skill milestones are only logged after this many seconds (the first minute is the baseline)
    logMax: 300              // lines kept in the lab log
  },

  // ------------------------------------------------------------- interface panels
  ui: {
    tickerEase: 8,           // how quickly the top-bar numbers count to their new value (per second)
    inspectorRefresh: 0.2,   // seconds between inspector text and bar updates (the brain viewer runs every frame)
    familyRefresh: 1,        // seconds between refreshes of the parent and children links
    childrenShown: 8,        // most living children listed as links
    chartRefresh: 0.5,       // seconds between chart redraws while the drawer is open
    chartMinutesShown: 0,    // 0 = charts show the whole run; otherwise only the last this many minutes
    chartSmoothSec: 10,      // steering is sampled every half second; its chart shows a rolling average over this many seconds
    skillChartFromSec: 30,   // the foraging-skill chart starts here: before that, too few hungry moments to measure
    toastSeconds: 6,         // a new lab log line shows briefly near the bottom when the drawer is closed
    hintSeconds: 14,         // the first-time hint fades after this many seconds
    brainTipSeconds: 40,     // if nobody has clicked a bug after this many seconds, a one-time tip suggests it

    // Brain viewer (the showpiece).
    brainSmoothing: 14,      // how quickly the drawn neuron activity follows the real activity (per second),
                             // so it glows smoothly instead of flickering at high speed
    brainLinkAlpha: 0.10,    // brightness of the faint wiring (every connection, by strength)
    brainActiveLinks: 70,    // the strongest live signals are drawn bright on top of the wiring...
    brainActiveAlpha: 0.85,  // ...this bright at full strength
    brainPulseMax: 160,      // signal pulses travelling along the connections at once
    brainPulseRate: 5,       // pulses per second sent along a connection carrying a full-strength signal
    brainPulseSpeed: 1.1,    // how fast a pulse crosses a connection (lengths per second)
    brainPulseMinSignal: 0.12, // weaker signals than this send no pulses
    brainNodeRadius: 5.5,    // neuron size in the viewer (CSS pixels)
    brainFoodScale: 8,       // food inputs run 0..foodSenseGain; the viewer shows them as a share of this

    // Chart colours: checked with a colour-blind-safety validator on the panel colour.
    chartEvolved: '#169DB3', // foraging skill chart: evolved bugs
    chartGhost: '#6F86A6',   // ...and random brains (the dashed grey reference line)
    chartPop: '#169DB3',     // population
    chartTraits: ['#169DB3', '#C47F0E', '#9474E6', '#DE5089'], // speed, size, sight, diet
    chartBirths: '#2EA862',  // births per minute (a line)
    chartDeaths: { starvation: '#C47F0E', oldAge: '#9474E6', eaten: '#DE5089', disaster: '#169DB3' }, // deaths (stacked)
    chartSteer: '#169DB3',   // steering
    chartGrid: 'rgba(140, 200, 255, 0.08)', // faint chart grid lines
    chartAxis: '#8FA6C4'     // axis labels
  }
};
