(function(){
  // theme toggle — inserted by JS so no-JS users never see a dead control.
  // OS preference is read live (never snapshotted); an explicit data-theme wins both ways.
  var nav = document.getElementById('topnav');
  var btn = document.createElement('button');
  btn.className = 'theme-toggle';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark(){
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : mq.matches;
  }
  function paint(){
    // action-labelled button: the text names the mode it switches TO; no aria-pressed
    btn.textContent = isDark() ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  }
  btn.addEventListener('click', function(){
    document.documentElement.setAttribute('data-theme', isDark() ? 'light' : 'dark');
    paint();
  });
  if (mq.addEventListener) mq.addEventListener('change', paint);
  nav.appendChild(btn); paint();

  // live model — runs only on activation, never on load or scroll
  var X = window.SJPX;
  var run = document.getElementById('run');
  run.hidden = false;
  var fields = {
    capex: { el: document.getElementById('in-capex'), out: document.getElementById('v-capex'), fmt: function(v){ return '$' + (v/1e6).toFixed(2) + 'm'; } },
    growth:{ el: document.getElementById('in-growth'), out: document.getElementById('v-growth'), fmt: function(v){ return v.toFixed(2) + '%'; } },
    rate:  { el: document.getElementById('in-rate'), out: document.getElementById('v-rate'), fmt: function(v){ return v.toFixed(2) + '%'; } },
    vol:   { el: document.getElementById('in-vol'), out: document.getElementById('v-vol'), fmt: function(v){ return v.toFixed(2) + '%'; } },
  };
  Object.keys(fields).forEach(function(k){
    var f = fields[k];
    function sync(){
      var v = +f.el.value, s = f.fmt(k === 'capex' ? v : v);
      f.out.textContent = s;
      f.el.setAttribute('aria-valuetext', s);
    }
    f.el.addEventListener('input', sync);
    sync();
  });
  function redink(s){ return s.replace(/−\$[\d.,]+[mk]?/g, function(m){ return '<span class="neg">' + m + '</span>'; }); }
  run.addEventListener('click', function(){
    var params = {
      capex: +fields.capex.el.value,
      growth: (+fields.growth.el.value)/100,
      rate: (+fields.rate.el.value)/100,
      revVol: (+fields.vol.el.value)/100,
    };
    var out = X.runAll(params);
    document.getElementById('ex2-slot').innerHTML =
      X.exhibit2SVG(out.st, out.p, { W: 720, H: 400, cls: 'ex2 ex-d' }) +
      X.exhibit2SVG(out.st, out.p, { W: 390, H: 330, cls: 'ex2 ex-m' });
    document.getElementById('r-median').innerHTML = redink('Median NPV ' + X.fmtM(out.st.p50));
    document.getElementById('r-line').innerHTML = redink(
      'P10 ' + X.fmtM(out.st.p10) + ' · P50 ' + X.fmtM(out.st.p50) + ' · P90 ' + X.fmtM(out.st.p90) +
      ' · P(NPV&lt;0) ' + (out.st.probNeg*100).toFixed(1) + '% · trials 10,000');
  });
})();
