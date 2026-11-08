// Genesis Lab - simulation: brain. Pure logic, never draws.
// A tiny neural network written from scratch: 25 inputs -> 12 hidden neurons
// -> 6 outputs, with tanh activation (every neuron's value ends up between -1 and 1).
// The 390 numbers live in the creature's DNA as one Float32Array, laid out as:
//   [0, 300)    input -> hidden weights (hidden neuron j, input i at j*25 + i)
//   [300, 312)  hidden biases
//   [312, 384)  hidden -> output weights (output k, hidden j at 312 + k*12 + j)
//   [384, 390)  output biases
var GL = GL || {};

GL.Brain = (function () {
  var C = GL.Config;
  var NI = C.brainInputs, NH = C.brainHidden, NO = C.brainOutputs;
  var OFF_B1 = NI * NH, OFF_W2 = OFF_B1 + NH, OFF_B2 = OFF_W2 + NH * NO;

  // Run the network once: inputs -> hidden -> outputs (all Float32Arrays, nothing allocated).
  function think(w, inputs, hidden, outputs) {
    var i, j, k, sum, base;
    for (j = 0; j < NH; j++) {
      sum = w[OFF_B1 + j];
      base = j * NI;
      for (i = 0; i < NI; i++) sum += w[base + i] * inputs[i];
      hidden[j] = Math.tanh(sum);
    }
    for (k = 0; k < NO; k++) {
      sum = w[OFF_B2 + k];
      base = OFF_W2 + k * NH;
      for (j = 0; j < NH; j++) sum += w[base + j] * hidden[j];
      outputs[k] = Math.tanh(sum);
    }
  }

  // Names for the brain viewer (Session 2). Slices run from the creature's left to its right.
  var INPUT_NAMES = [
    'Food, far left', 'Food, left', 'Food, ahead', 'Food, right', 'Food, far right',
    'Creature, far left', 'Creature, left', 'Creature, ahead', 'Creature, right', 'Creature, far right',
    'Size, far left', 'Size, left', 'Size, ahead', 'Size, right', 'Size, far right',
    'Wall closeness', 'Centre is left/right', 'Centre is ahead/behind',
    'Energy', 'Health', 'Age', 'Speed',
    'Inner clock', 'Memory 1', 'Memory 2'
  ];
  var OUTPUT_NAMES = ['Thrust', 'Turn', 'Bite', 'Reproduce', 'Memory 1', 'Memory 2'];

  // Positions of the inputs and outputs, so other code can use names instead of numbers.
  var IN = { FOOD: 0, CREATURE: 5, SIZE: 10, WALL: 15, CENTER_SIDE: 16, CENTER_FWD: 17,
             ENERGY: 18, HEALTH: 19, AGE: 20, SPEED: 21, CLOCK: 22, MEM1: 23, MEM2: 24 };
  var OUT = { THRUST: 0, TURN: 1, BITE: 2, REPRODUCE: 3, MEM1: 4, MEM2: 5 };

  return {
    think: think, INPUTS: NI, HIDDEN: NH, OUTPUTS: NO,
    OFF_B1: OFF_B1, OFF_W2: OFF_W2, OFF_B2: OFF_B2,
    INPUT_NAMES: INPUT_NAMES, OUTPUT_NAMES: OUTPUT_NAMES, IN: IN, OUT: OUT
  };
})();
