// SJP Consulting — Exhibit engine. Shared by the build step (Node) and the live page.
// Seeded PRNG: the static build-time SVGs and the live default run agree exactly on V8
// (Node and Chrome); other engines agree to display precision.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller pair from a uniform source
function gaussPair(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const m = Math.sqrt(-2 * Math.log(u));
  return [m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)];
}

const DEFAULTS = {
  capex: 1600000,   // initial outlay, year 0
  rev0: 500000,     // year-1 revenue
  cost0: 260000,    // year-1 operating cost
  growth: 0.025,    // p.a., applies to revenue and cost
  rate: 0.10,       // discount rate
  revVol: 0.28,     // revenue volatility (s.d. as share of expected)
  costVol: 0.18,    // cost volatility
  rho: 0.45,        // revenue-cost correlation (Cholesky)
  years: 12,
  trials: 10000,
  seed: 42,
};

// Core simulation. Shock multipliers floored at zero: revenue and cost cannot go negative.
function simulate(p) {
  const { capex, rev0, cost0, growth, rate, revVol, costVol, rho, years, trials, seed } = p;
  const rng = mulberry32(seed);
  const chol = Math.sqrt(1 - rho * rho); // Cholesky factor for 2x2
  const npv = new Float64Array(trials);
  const cum = new Float64Array(trials * (years + 1));
  const disc = new Float64Array(years + 1);
  for (let t = 1; t <= years; t++) disc[t] = 1 / Math.pow(1 + rate, t);

  for (let i = 0; i < trials; i++) {
    let acc = -capex;
    cum[i * (years + 1)] = acc;
    for (let t = 1; t <= years; t++) {
      const [z1, z2] = gaussPair(rng);
      const zc = rho * z1 + chol * z2; // correlated cost shock
      const g = Math.pow(1 + growth, t - 1);
      const rev = rev0 * g * Math.max(0, 1 + revVol * z1);
      const cost = cost0 * g * Math.max(0, 1 + costVol * zc);
      acc += (rev - cost) * disc[t];
      cum[i * (years + 1) + t] = acc;
    }
    npv[i] = acc;
  }
  return { npv, cum };
}

function quantileSorted(sorted, q) {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stats(npvArr) {
  const s = Float64Array.from(npvArr).sort();
  let neg = 0, sum = 0;
  for (let i = 0; i < s.length; i++) { sum += s[i]; if (s[i] < 0) neg++; }
  return {
    p10: quantileSorted(s, 0.10),
    p50: quantileSorted(s, 0.50),
    p90: quantileSorted(s, 0.90),
    mean: sum / s.length,
    probNeg: neg / s.length,
    sorted: s,
  };
}

function fmtM(x) {
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  const k = Math.round(a / 1e3);
  if (k === 0) return '$0';
  if (k >= 1000) return sign + '$' + (a / 1e6).toFixed(2) + 'm';
  return sign + '$' + k + 'k';
}

function tickText(x, y, v, anchor) {
  const cls = v < 0 ? 'ax neg' : 'ax';
  const a = anchor ? ` text-anchor="${anchor}"` : '';
  return `<text x="${x}" y="${y}" class="${cls}"${a}>${fmtM(v)}</text>`;
}

// ---------- Exhibit 1: fan of cumulative-NPV percentile paths ----------
function exhibit1SVG(sim, p, opts) {
  const o = Object.assign({ W: 1140, H: 200, cls: 'ex1 ex-d', padR: 64 }, opts || {});
  const { W, H, cls } = o;
  const padL = 6, padR = o.padR, padT = 8, padB = 20;
  const { years, trials } = p;
  const cols = years + 1;
  const perYear = [];
  for (let t = 0; t < cols; t++) {
    const col = new Float64Array(trials);
    for (let i = 0; i < trials; i++) col[i] = sim.cum[i * cols + t];
    perYear.push(col.sort());
  }
  const lo = Math.min(...perYear.map(c => quantileSorted(c, 0.005)));
  const hi = Math.max(...perYear.map(c => quantileSorted(c, 0.995)));
  const x = t => padL + (t / years) * (W - padL - padR);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const levels = [];
  for (let i = 1; i <= 60; i++) levels.push((i - 0.5) / 60);
  let paths = '';
  for (const q of levels) {
    let d = '';
    for (let t = 0; t < cols; t++) {
      const v = quantileSorted(perYear[t], q);
      d += (t ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(v).toFixed(1);
    }
    paths += `<path d="${d}" class="fan-line"/>`;
  }
  let dmed = '';
  for (let t = 0; t < cols; t++) {
    dmed += (t ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(quantileSorted(perYear[t], 0.5)).toFixed(1);
  }
  // y-scale annotations: multiples of $0.5m within range, thinned to min / 0 / max
  const step = 500000;
  const mults = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) mults.push(v);
  const yVals = [...new Set([mults[0], 0, mults[mults.length - 1]])].filter(v => v >= lo && v <= hi);
  const fmtShort = v => {
    if (v === 0) return '$0';
    const sign = v < 0 ? '−' : '';
    const a = Math.abs(v);
    return a >= 1e6 ? sign + '$' + (a / 1e6).toFixed(1) + 'm' : sign + '$' + Math.round(a / 1e3) + 'k';
  };
  let yAnn = '', yGrid = '';
  for (const v of yVals) {
    const yy = y(v).toFixed(1);
    if (v === 0) {
      yGrid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="zero"/>`;
    } else {
      yGrid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="grid"/>`;
    }
    const cls = v < 0 ? 'ax neg' : 'ax';
    yAnn += `<text x="${W - padR + 8}" y="${(+yy + 3.5).toFixed(1)}" class="${cls}" text-anchor="start">${fmtShort(v)}</text>`;
  }
  const yrTicks = [0, 4, 8, years].map(t =>
    `<text x="${x(t).toFixed(1)}" y="${H - 4}" class="ax"${t === years ? ' text-anchor="end"' : ''}>${t}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Fan chart of cumulative NPV percentile paths over ${years} years" class="${cls}">
${yGrid}${paths}<path d="${dmed}" class="fan-median"/>
${yrTicks}${yAnn}</svg>`;
}

// ---------- Exhibit 2: NPV histogram + CDF ----------
function exhibit2SVG(st, p, opts) {
  const o = Object.assign({ W: 720, H: 400, cls: 'ex2 ex-d' }, opts || {});
  const { W, H, cls } = o;
  const padL = 8, padR = Math.round(W * 0.075) + 8, padT = 18, padB = 34;
  const s = st.sorted, n = s.length;
  const lo = quantileSorted(s, 0.002), hi = quantileSorted(s, 0.998);
  const BINS = 40, bw = (hi - lo) / BINS;
  const counts = new Array(BINS).fill(0);
  for (let i = 0; i < n; i++) {
    const b = Math.floor((s[i] - lo) / bw);
    if (b < 0 || b >= BINS) continue; // drop the clipped 0.4% tails; the CDF carries tail mass
    counts[b]++;
  }
  const cmax = Math.max(...counts);
  const x = v => padL + ((v - lo) / (hi - lo)) * (W - padL - padR);
  const yh = c => padT + (1 - c / cmax) * (H - padT - padB);
  const base = (H - padB);

  let dOut = `M${x(lo).toFixed(1)} ${base}`;
  for (let b = 0; b < BINS; b++) {
    const x0 = x(lo + b * bw), x1 = x(lo + (b + 1) * bw), yy = yh(counts[b]);
    dOut += `L${x0.toFixed(1)} ${yy.toFixed(1)}L${x1.toFixed(1)} ${yy.toFixed(1)}`;
  }
  dOut += `L${x(hi).toFixed(1)} ${base}`;
  const dFill = dOut + 'Z';

  let dCdf = '';
  const STEPS = 120;
  for (let i = 0; i <= STEPS; i++) {
    const v = lo + (i / STEPS) * (hi - lo);
    let a = 0, b2 = n;
    while (a < b2) { const m = (a + b2) >> 1; if (s[m] <= v) a = m + 1; else b2 = m; }
    const f = a / n;
    const yy = padT + (1 - f) * (H - padT - padB);
    dCdf += (i ? 'L' : 'M') + x(v).toFixed(1) + ' ' + yy.toFixed(1);
  }

  let grid = '';
  for (let i = 1; i <= 3; i++) {
    const gy = padT + (i / 4) * (H - padT - padB);
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" class="grid"/>`;
  }

  const rules = [['P10', st.p10], ['P50', st.p50], ['P90', st.p90]].map(([lbl, v]) =>
    `<line x1="${x(v).toFixed(1)}" y1="${padT - 2}" x2="${x(v).toFixed(1)}" y2="${base}" class="prule"/>` +
    `<text x="${(x(v) + 4).toFixed(1)}" y="${padT + 10}" class="plabel">${lbl}</text>`
  ).join('');

  const zero = (lo < 0 && hi > 0)
    ? `<line x1="${x(0).toFixed(1)}" y1="${padT - 2}" x2="${x(0).toFixed(1)}" y2="${base}" class="zrule"/>`
    : '';

  const midV = (lo < 0 && hi > 0) ? 0 : (lo + hi) / 2;
  const ticks =
    tickText(x(lo).toFixed(1), H - 12, lo, 'start') +
    tickText(x(midV).toFixed(1), H - 12, midV, 'middle') +
    tickText(x(hi).toFixed(1), H - 12, hi, 'end');
  const cdfAx = [0, 0.5, 1].map(f => {
    const yy = padT + (1 - f) * (H - padT - padB);
    return `<text x="${W - padR + 8}" y="${(yy + 3.5).toFixed(1)}" class="ax">${(f * 100).toFixed(0)}%</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Histogram of simulated NPV outcomes with cumulative distribution overlay" class="${cls}">
${grid}<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" class="baseline"/>
<path d="${dFill}" class="hist-fill"/><path d="${dOut}" class="hist-line"/>
<path d="${dCdf}" class="cdf"/>
${zero}${rules}${ticks}${cdfAx}
<text x="${W - padR + 8}" y="${padT + 22}" class="cdf-tag">CDF</text></svg>`;
}

function runAll(params) {
  const p = Object.assign({}, DEFAULTS, params || {});
  const sim = simulate(p);
  const st = stats(sim.npv);
  return { p, sim, st };
}

if (typeof module !== 'undefined') {
  module.exports = { DEFAULTS, simulate, stats, fmtM, exhibit1SVG, exhibit2SVG, runAll, quantileSorted };
} else if (typeof window !== 'undefined') {
  window.SJPX = { DEFAULTS, simulate, stats, fmtM, exhibit1SVG, exhibit2SVG, runAll, quantileSorted };
}
