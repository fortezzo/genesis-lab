// Genesis Lab - drawing: camera.
// Where we look (x, y in world units) and how close (zoom = screen pixels per
// unit). Zoom and follow moves glide toward a target instead of snapping;
// dragging moves the view directly so it feels attached to your finger.
var GL = GL || {};

GL.Camera = function () {
  this.x = 0; this.y = 0; this.zoom = 0.2;
  this.tx = 0; this.ty = 0; this.tzoom = 0.2;   // where the camera is gliding to
  this.w = 800; this.h = 600;                   // screen size in CSS pixels
  this.follow = null;                           // creature being followed (or null)
  this.followId = 0;
};

GL.Camera.prototype = {
  resize: function (w, h, first) {
    this.w = w; this.h = h;
    if (first) {
      this.zoom = this.tzoom = this.fitZoom() * GL.Config.render.startZoomFactor;
    }
    this.tzoom = this.clampZoom(this.tzoom);
    this.zoom = this.clampZoom(this.zoom);
  },
  // Zoom at which the whole dish fits on screen.
  fitZoom: function () {
    return Math.min(this.w, this.h) / (GL.Config.dishRadius * 2 * 1.06);
  },
  clampZoom: function (z) {
    var R = GL.Config.render;
    return GL.M.clamp(z, this.fitZoom() * R.zoomMinFactor, R.zoomMax);
  },
  clampCenter: function () {
    var R = GL.Config.dishRadius, d = Math.sqrt(this.tx * this.tx + this.ty * this.ty);
    if (d > R) { this.tx *= R / d; this.ty *= R / d; }
  },

  screenToWorldX: function (sx) { return this.x + (sx - this.w / 2) / this.zoom; },
  screenToWorldY: function (sy) { return this.y + (sy - this.h / 2) / this.zoom; },
  worldToScreenX: function (wx) { return (wx - this.x) * this.zoom + this.w / 2; },
  worldToScreenY: function (wy) { return (wy - this.y) * this.zoom + this.h / 2; },

  // Zoom by a factor, keeping the world point under the cursor in place.
  zoomAt: function (sx, sy, factor) {
    var newZoom = this.clampZoom(this.tzoom * factor);
    // World point under the cursor, judged from where the camera is heading.
    var wx = this.tx + (sx - this.w / 2) / this.tzoom, wy = this.ty + (sy - this.h / 2) / this.tzoom;
    if (!this.follow) {
      this.tx = wx - (sx - this.w / 2) / newZoom;
      this.ty = wy - (sy - this.h / 2) / newZoom;
      this.clampCenter();
    }
    this.tzoom = newZoom;
  },
  // Drag the view by screen pixels.
  pan: function (dx, dy) {
    this.stopFollowing();
    this.tx -= dx / this.zoom; this.ty -= dy / this.zoom;
    this.clampCenter();
    this.x = this.tx; this.y = this.ty;
  },

  startFollowing: function (c) {
    this.follow = c; this.followId = c.id;
    // Zoom in to see it properly (but not absurdly close on small screens).
    var minZoom = Math.min(GL.Config.render.followZoom, this.fitZoom() * 8);
    if (this.tzoom < minZoom) this.tzoom = this.clampZoom(minZoom);
  },
  stopFollowing: function () { this.follow = null; this.followId = 0; },

  // Glide toward the target. Pass reducedMotion = true to jump straight there.
  update: function (dt, reducedMotion) {
    var f = this.follow;
    if (f) {
      if (!f.alive || f.id !== this.followId) this.follow = null;   // it died: stay where we are
      else { this.tx = f.x; this.ty = f.y; }
    }
    var k = reducedMotion ? 1 : 1 - Math.exp(-GL.Config.render.cameraEase * dt);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    // Zoom glides in log space so zooming in and out feel equally smooth.
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tzoom) - Math.log(this.zoom)) * k);
  }
};
