/* Hand-drawn <canvas> charts, devicePixelRatio aware. No library. */
(function () {
  const C = { green: "#00d35a", red: "#ff453a", blue: "#0a84ff", orange: "#ff9f0a", t3: "rgba(235,235,245,0.3)" };
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 390, h = canvas.clientHeight || 220;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function lineChart(canvas, data, opts) {
    opts = opts || {};
    const pts = (data && data.points) || [];
    const prevLen = canvas._prevLen || 0;
    canvas._prevLen = pts.length;
    const animate = !reduce && prevLen > 0 && pts.length > prevLen;
    const start = performance.now();
    function frame(now) {
      const p = animate ? Math.min(1, (now - start) / 250) : 1;
      draw(canvas, data, opts, p);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function draw(canvas, data, opts, progress) {
    const { ctx, w, h } = setup(canvas);
    const pts = (data && data.points) || [];
    const marks = (data && data.marks) || [];
    const padT = 46, padB = 10, padX = 16;
    if (pts.length < 2) {
      ctx.strokeStyle = C.t3; ctx.setLineDash([4, 4]); ctx.beginPath();
      ctx.moveTo(padX, h / 2); ctx.lineTo(w - padX, h / 2); ctx.stroke();
      return;
    }
    const startV = data.start_value != null ? data.start_value : pts[0].value;
    let lo = Math.min(startV, ...pts.map((p) => p.value)), hi = Math.max(startV, ...pts.map((p) => p.value));
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts || t0 + 1;
    const X = (t) => padX + ((t - t0) / Math.max(1, t1 - t0)) * (w - 2 * padX);
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);

    // slide-in of the newest point (250ms)
    const shown = pts.slice();
    if (progress < 1 && shown.length >= 2) {
      const a = shown[shown.length - 2], b = shown[shown.length - 1];
      shown[shown.length - 1] = { ts: a.ts + (b.ts - a.ts) * progress, value: a.value + (b.value - a.value) * progress };
    }
    const color = opts.color || C.green;

    // dashed start line
    ctx.strokeStyle = C.t3; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padX, Y(startV)); ctx.lineTo(w - padX, Y(startV)); ctx.stroke();
    ctx.setLineDash([]);

    // gradient under the line
    const grad = ctx.createLinearGradient(0, padT, 0, h);
    grad.addColorStop(0, "rgba(0,211,90,0.28)"); grad.addColorStop(1, "rgba(0,211,90,0)");
    ctx.beginPath();
    shown.forEach((p, i) => (i ? ctx.lineTo(X(p.ts), Y(p.value)) : ctx.moveTo(X(p.ts), Y(p.value))));
    ctx.lineTo(X(shown[shown.length - 1].ts), h); ctx.lineTo(X(shown[0].ts), h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
    shown.forEach((p, i) => (i ? ctx.lineTo(X(p.ts), Y(p.value)) : ctx.moveTo(X(p.ts), Y(p.value))));
    ctx.stroke();

    // marks above the line; a later mark moves up a row, never overlaps
    ctx.font = "600 11px -apple-system, 'SF Pro Text', sans-serif";
    const rows = [];
    marks.filter((m) => m.ts >= t0 && m.ts <= t1).forEach((m) => {
      const x = X(m.ts);
      const label = m.label || "";
      const tw = ctx.measureText(label).width + 12;
      const left = Math.max(2, Math.min(w - tw - 2, x - tw / 2));
      let row = 0;
      while (rows[row] && rows[row] > left - 4) row++;
      rows[row] = left + tw;
      const y = 4 + row * 20;
      const col = m.kind === "buy" ? C.blue : m.kind === "stop" ? C.red : C.green;
      ctx.fillStyle = "rgba(28,28,30,0.92)";
      roundRect(ctx, left, y, tw, 18, 9); ctx.fill();
      ctx.fillStyle = col; ctx.fillText(label, left + 6, y + 13);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, padT - 4); ctx.stroke(); ctx.globalAlpha = 1;
    });
  }

  function candles(canvas, cs, opts) {
    const { ctx, w, h } = setup(canvas);
    opts = opts || {};
    if (!cs || !cs.length) {
      ctx.strokeStyle = C.t3; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(16, h / 2); ctx.lineTo(w - 16, h / 2); ctx.stroke();
      return;
    }
    const pad = 12;
    let lo = Math.min(...cs.map((c) => c.low)), hi = Math.max(...cs.map((c) => c.high));
    if (opts.exit != null) { lo = Math.min(lo, opts.exit); hi = Math.max(hi, opts.exit); }
    if (hi - lo < 1e-12) { hi *= 1.01; lo *= 0.99; }
    const Y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
    const bw = Math.max(2, Math.min(10, (w - 32) / cs.length - 2));
    cs.forEach((c, i) => {
      const x = 16 + i * ((w - 32) / cs.length) + bw / 2;
      const up = c.close >= c.open;
      ctx.strokeStyle = ctx.fillStyle = up ? C.green : C.red;
      ctx.beginPath(); ctx.moveTo(x, Y(c.high)); ctx.lineTo(x, Y(c.low)); ctx.stroke();
      const top = Y(Math.max(c.open, c.close)), bot = Y(Math.min(c.open, c.close));
      ctx.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
    });
    if (opts.exit != null) {
      ctx.strokeStyle = C.orange; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(8, Y(opts.exit)); ctx.lineTo(w - 8, Y(opts.exit)); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  window.DeskChart = { lineChart, candles };
})();
