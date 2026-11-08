// Genesis Lab - interface: mouse, touch and keyboard.
// Drag to pan, scroll or pinch to zoom, click or tap a creature to select and
// follow it (click empty soil to let go). While a god-mode tool is armed, a click
// drops the meteor or the meat-eaters, and a drag paints food (two fingers still pan).
// Any drag, scroll or click hands the camera back from cinematic mode.
// Keys: Space pause, 1-5 speeds, F follow the champion, C charts and lab log,
// G god mode and Hall of Fame, V cinematic camera, Esc put a tool away or deselect,
// H hide all panels (screenshot mode), P save a screenshot, M mute, backtick debug overlay.
var GL = GL || {};

GL.Controls = function (app) {
  var canvas = app.renderer.canvas, cam = app.renderer.camera, R = GL.Config.render;
  var pointers = {}, count = 0, dragged = false, downX = 0, downY = 0, lastX = 0, lastY = 0;
  var pinchDist = 0, pinchX = 0, pinchY = 0, toolDown = false;

  function interacted() { app.hud.hideHint(); }
  function takeCamera() { if (app.cinematic.on) app.cinematic.stop(); }

  function pinchInfo() {
    var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    count = Object.keys(pointers).length;
    if (count === 1) {
      dragged = false; downX = lastX = e.clientX; downY = lastY = e.clientY;
      toolDown = app.godMode.armed === 'paint' && app.godMode.pointer('down', e.clientX, e.clientY);
    }
    if (count === 2) {
      if (toolDown) { app.godMode.pointer('up', e.clientX, e.clientY); toolDown = false; }
      var p = pinchInfo(); pinchDist = p.d; pinchX = p.x; pinchY = p.y; dragged = true;
    }
    interacted();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (app.godMode.armed && count <= 1) app.godMode.pointer('move', e.clientX, e.clientY);   // the tool follows the pointer
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY;
    if (count === 1) {
      if (toolDown) return;                                       // painting, not panning
      if (!dragged && Math.hypot(e.clientX - downX, e.clientY - downY) > 5) { dragged = true; takeCamera(); }
      if (dragged) { cam.pan(e.clientX - lastX, e.clientY - lastY); canvas.classList.add('grabbing'); }
      lastX = e.clientX; lastY = e.clientY;
    } else if (count === 2) {
      takeCamera();
      var p = pinchInfo();
      if (pinchDist > 0) cam.zoomAt(p.x, p.y, p.d / pinchDist);
      cam.pan(p.x - pinchX, p.y - pinchY);
      pinchDist = p.d; pinchX = p.x; pinchY = p.y;
    }
  });
  canvas.addEventListener('pointerleave', function (e) { if (app.godMode.armed && !toolDown) app.godMode.pointer('leave', e.clientX, e.clientY); });

  function release(e) {
    if (!pointers[e.pointerId]) return;
    var wasClick = count === 1 && !dragged;
    delete pointers[e.pointerId];
    count = Object.keys(pointers).length;
    canvas.classList.remove('grabbing');
    if (toolDown) { app.godMode.pointer('up', e.clientX, e.clientY); toolDown = false; return; }
    if (wasClick && e.type === 'pointerup') {
      if (app.godMode.armed) { app.godMode.pointer('click', e.clientX, e.clientY); return; }   // drop the meteor or the meat-eaters
      takeCamera();
      var c = app.renderer.pick(e.clientX, e.clientY);
      app.hud.dismissDeath();                    // any click answers the "it died" notice
      app.renderer.select(c);                    // empty soil = deselect
      app.hud.update(0, true);
    }
    if (count === 1) {                           // one finger left after a pinch: keep panning smoothly
      var id = Object.keys(pointers)[0];
      lastX = pointers[id].x; lastY = pointers[id].y;
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    takeCamera();
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    // A mouse notch is about 100; trackpads send many small steps. Both feel the same.
    var factor = Math.pow(R.wheelZoomStep, -dy / 100);
    cam.zoomAt(e.clientX, e.clientY, factor);
    interacted();
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var loop = app.loop, speeds = GL.Config.speedOptions;
    if (e.code === 'Space') { e.preventDefault(); loop.togglePause(); app.hud.refreshSpeeds(); }
    else if (e.key >= '1' && e.key <= String(speeds.length)) { loop.setSpeed(speeds[Number(e.key) - 1]); app.hud.refreshSpeeds(); }
    else if (e.key === 'Escape') {
      if (app.godMode.armed) app.godMode.disarm();
      else if (app.cinematic.on) app.cinematic.stop();
      else if (app.renderer.highlightSpecies && !app.renderer.getSelected()) app.highlightSpecies(0);
      else { app.hud.dismissDeath(); app.renderer.select(null); app.hud.update(0, true); }
    }
    else if (e.key === '`' || e.code === 'Backquote') app.hud.toggleDebug();
    else if (e.ctrlKey || e.metaKey || e.altKey) return;           // leave browser shortcuts alone
    else if (e.code === 'KeyF') app.hud.followChampion();
    else if (e.code === 'KeyC') app.hud.toggleDrawer();
    else if (e.code === 'KeyG') app.godMode.toggle();
    else if (e.code === 'KeyV') app.cinematic.toggle();
    else if (e.code === 'KeyH') { app.hud.toggleClean(); app.layoutChanged(); }
    else if (e.code === 'KeyP') app.hud.screenshot();
    else if (e.code === 'KeyM') app.sound.toggleMute();
    else return;
    interacted();
  });
};
