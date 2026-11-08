// Genesis Lab - core: spatial hash grid.
// The dish is cut into square cells (160 units by default). Every tick each
// thing is filed under its cell, so a creature only has to look at the few
// cells around it instead of at every other thing in the dish.
// Rebuilding is a counting sort into flat typed arrays: no new objects.
var GL = GL || {};

GL.SpatialGrid = function (halfSize, cellSize, capacity) {
  this.cellSize = cellSize;
  this.inv = 1 / cellSize;
  this.origin = -halfSize;
  this.cols = Math.ceil((halfSize * 2) / cellSize);
  this.cellCount = this.cols * this.cols;
  this.cellStart = new Int32Array(this.cellCount + 1);
  this.cellFill = new Int32Array(this.cellCount);
  this.capacity = capacity;
  this.items = new Int32Array(capacity);
  this.itemCell = new Int32Array(capacity);
  this.count = 0;
};

GL.SpatialGrid.prototype = {
  cellOf: function (x, y) {
    var cols = this.cols;
    var cx = Math.floor((x - this.origin) * this.inv);
    var cy = Math.floor((y - this.origin) * this.inv);
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1;
    if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1;
    return cy * cols + cx;
  },

  // File items 0..n-1 whose positions are xs[i], ys[i]. alive[i] = 0 skips an item (optional).
  rebuild: function (xs, ys, n, alive) {
    var cellStart = this.cellStart, cellFill = this.cellFill, itemCell = this.itemCell;
    var cells = this.cellCount, i, c;
    if (n > this.capacity) n = this.capacity;
    cellStart.fill(0);
    for (i = 0; i < n; i++) {
      if (alive && !alive[i]) { itemCell[i] = -1; continue; }
      c = this.cellOf(xs[i], ys[i]);
      itemCell[i] = c;
      cellStart[c + 1]++;
    }
    for (c = 0; c < cells; c++) cellStart[c + 1] += cellStart[c];
    for (c = 0; c < cells; c++) cellFill[c] = cellStart[c];
    var items = this.items;
    for (i = 0; i < n; i++) {
      c = itemCell[i];
      if (c >= 0) items[cellFill[c]++] = i;
    }
    this.count = cellStart[cells];
  },

  // Write the indices of every item in the cells touching the circle (x, y, r) into out.
  // Returns how many were written. Callers still check the exact distance.
  query: function (x, y, r, out) {
    var cols = this.cols, inv = this.inv, o = this.origin;
    var x0 = Math.floor((x - r - o) * inv), x1 = Math.floor((x + r - o) * inv);
    var y0 = Math.floor((y - r - o) * inv), y1 = Math.floor((y + r - o) * inv);
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 >= cols) x1 = cols - 1; if (y1 >= cols) y1 = cols - 1;
    var cellStart = this.cellStart, items = this.items, max = out.length, n = 0;
    for (var cy = y0; cy <= y1; cy++) {
      var row = cy * cols;
      for (var cx = x0; cx <= x1; cx++) {
        var c = row + cx;
        for (var k = cellStart[c], e = cellStart[c + 1]; k < e && n < max; k++) out[n++] = items[k];
      }
    }
    return n;
  },

  // How many cells currently hold at least one item (for the debug overlay).
  usedCells: function () {
    var used = 0, s = this.cellStart;
    for (var c = 0; c < this.cellCount; c++) if (s[c + 1] > s[c]) used++;
    return used;
  }
};
