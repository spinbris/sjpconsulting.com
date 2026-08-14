// Build: template.html + exhibits.js + ui.js -> index.html
// Function replacers everywhere: replacement strings never pass through $-substitution.
const fs = require('fs');
const X = require('./exhibits.js');

const { p, sim, st } = X.runAll();
const ex1d = X.exhibit1SVG(sim, p, { W: 1140, H: 200, cls: 'ex1 ex-d', padR: 64 });
const ex1m = X.exhibit1SVG(sim, p, { W: 390, H: 240, cls: 'ex1 ex-m', padR: 52 });
const ex2d = X.exhibit2SVG(st, p, { W: 720, H: 400, cls: 'ex2 ex-d' });
const ex2m = X.exhibit2SVG(st, p, { W: 390, H: 330, cls: 'ex2 ex-m' });
const redink = s => s.replace(/−\$[\d.,]+[mk]?/g, m => `<span class="neg">${m}</span>`);
const rMedian = redink('Median NPV ' + X.fmtM(st.p50));
const rLine = redink(`P10 ${X.fmtM(st.p10)} · P50 ${X.fmtM(st.p50)} · P90 ${X.fmtM(st.p90)} · P(NPV&lt;0) ${(st.probNeg * 100).toFixed(1)}% · trials 10,000`);
const engine = fs.readFileSync('exhibits.js', 'utf8');
const ui = fs.readFileSync('ui.js', 'utf8');

let html = fs.readFileSync('template.html', 'utf8');
const inject = (needle, value) => {
  if (!html.includes(needle)) throw new Error('needle missing: ' + needle);
  html = html.replace(needle, () => value);
};
inject('<!--EXHIBIT1D-->', ex1d);
inject('<!--EXHIBIT1M-->', ex1m);
inject('<!--EXHIBIT2D-->', ex2d);
inject('<!--EXHIBIT2M-->', ex2m);
inject('<!--R_MEDIAN-->', rMedian);
inject('<!--R_LINE-->', rLine);
inject('/*ENGINE*/', engine);
inject('/*UI*/', ui);
fs.writeFileSync('index.html', html);
console.log('built index.html', fs.statSync('index.html').size, 'bytes');
console.log('results:', X.fmtM(st.p10), X.fmtM(st.p50), X.fmtM(st.p90), (st.probNeg * 100).toFixed(1) + '%');
