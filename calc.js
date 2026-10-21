/* Cálculo del torneo de truco. Es la única fuente de verdad:
   lo usa la página y lo usa el agente programado (node calc.js). */
(function (root) {
  "use strict";
  var N = function (v) { return (v === "" || v === null || v === undefined || isNaN(+v)) ? null : +v; };

  function validarResultado(tantos, ta, tb) {
    ta = N(ta); tb = N(tb);
    if (ta === null || tb === null) return "Completá los tantos de los dos jugadores.";
    if (ta < 0 || tb < 0) return "Los tantos no pueden ser negativos.";
    if (ta === tb) return "Un partido de truco no termina empatado.";
    if (Math.max(ta, tb) !== tantos) return "El ganador tiene que llegar a " + tantos + ".";
    return null;
  }

  // Qué resultado vale para cada tabla
  function efectivo(p) {
    var b = p.blyts && N(p.blyts.ta) !== null && N(p.blyts.tb) !== null ? { ta: +p.blyts.ta, tb: +p.blyts.tb } : null;
    var r = p.rec && N(p.rec.ta) !== null && N(p.rec.tb) !== null ? { ta: +p.rec.ta, tb: +p.rec.tb } : null;
    if (p.estado === "jugado") return { blyts: b, real: b, cuando: p.jugadoEn, ajustado: false };
    if (p.estado === "caido") return { blyts: b, real: null, cuando: p.caidoEn, ajustado: false };
    if (p.estado === "recuperado") return { blyts: b, real: r, cuando: p.recuperadoEn || p.caidoEn, ajustado: true };
    return { blyts: null, real: null, cuando: null, ajustado: false };
  }

  function bonusDe(cfg, tw, tl) {
    var b = cfg.bonus || {}, half = cfg.tantos / 2, g = [], p = [];
    if (b.malas && b.malas.on && tl <= half) g.push({ k: "malas", pts: N(b.malas.pts) || 0, txt: "dejó al rival en las malas" });
    if (b.zapatero && b.zapatero.on && tl === 0) g.push({ k: "zapatero", pts: N(b.zapatero.pts) || 0, txt: "zapatero" });
    if (b.defensivo && b.defensivo.on && tl >= (N(b.defensivo.min) || cfg.tantos - 5)) p.push({ k: "defensivo", pts: N(b.defensivo.pts) || 0, txt: "perdió peleando" });
    return { ganador: g, perdedor: p };
  }

  function fila(j) {
    return { id: j.id, nombre: j.nombre, pj: 0, pg: 0, pp: 0, tf: 0, tc: 0, dif: 0, pts: 0, bonus: 0,
      bonusDet: { malas: 0, zapatero: 0, defensivo: 0, racha: 0 }, rachaActual: 0, rachaMax: 0, rachaMaxNeg: 0, forma: [], caidos: 0 };
  }
  function sumar(row, gano, tf, tc, pts) {
    row.pj++; if (gano) row.pg++; else row.pp++;
    row.tf += tf; row.tc += tc; row.dif = row.tf - row.tc; row.pts += pts;
  }
  function ordenar(rows) {
    return rows.sort(function (x, y) {
      return (y.pts - x.pts) || (y.dif - x.dif) || (y.tf - x.tf) || (y.pg - x.pg) || x.nombre.localeCompare(y.nombre);
    }).map(function (r, i) { r.pos = i + 1; return r; });
  }

  function calcular(torneo, partidos, ahora) {
    var cfg = torneo; ahora = ahora ? new Date(ahora) : new Date();
    var js = (torneo.jugadores || []).filter(function (j) { return j && j.id && j.nombre; });
    var byId = {}; js.forEach(function (j) { byId[j.id] = j; });
    var R = {}, B = {}; js.forEach(function (j) { R[j.id] = fila(j); B[j.id] = fila(j); });
    var lista = [], hist = [];
    var total = js.length * (js.length - 1) / 2;

    (partidos || []).forEach(function (p) {
      if (!byId[p.a] || !byId[p.b] || p.a === p.b) return;
      var e = efectivo(p), item = { p: p, e: e, bonusA: [], bonusB: [] };
      if (p.estado === "caido" || p.estado === "recuperado") { R[p.a].caidos++; R[p.b].caidos++; }
      if (e.blyts) {
        var bw = e.blyts.ta > e.blyts.tb;
        sumar(B[p.a], bw, e.blyts.ta, e.blyts.tb, bw ? cfg.ptsV : cfg.ptsD);
        sumar(B[p.b], !bw, e.blyts.tb, e.blyts.ta, !bw ? cfg.ptsV : cfg.ptsD);
      }
      if (e.real) {
        var aw = e.real.ta > e.real.tb;
        var bo = aw ? bonusDe(cfg, e.real.ta, e.real.tb) : bonusDe(cfg, e.real.tb, e.real.ta);
        item.bonusA = aw ? bo.ganador : bo.perdedor; item.bonusB = aw ? bo.perdedor : bo.ganador;
        var add = function (row, arr) { arr.forEach(function (x) { row.bonus += x.pts; row.bonusDet[x.k] += 1; }); return arr.reduce(function (s, x) { return s + x.pts; }, 0); };
        sumar(R[p.a], aw, e.real.ta, e.real.tb, (aw ? cfg.ptsV : cfg.ptsD) + add(R[p.a], item.bonusA));
        sumar(R[p.b], !aw, e.real.tb, e.real.ta, (!aw ? cfg.ptsV : cfg.ptsD) + add(R[p.b], item.bonusB));
        hist.push({ cuando: e.cuando || "", a: p.a, b: p.b, ta: e.real.ta, tb: e.real.tb, id: p.id });
      }
      lista.push(item);
    });

    // Rachas en orden cronológico
    hist.sort(function (x, y) { return String(x.cuando).localeCompare(String(y.cuando)); });
    var rc = cfg.bonus && cfg.bonus.racha;
    hist.forEach(function (h) {
      [[h.a, h.ta > h.tb], [h.b, h.tb > h.ta]].forEach(function (pair) {
        var r = R[pair[0]], gano = pair[1];
        r.forma.push(gano ? "G" : "P");
        if (gano) {
          r.rachaActual = r.rachaActual > 0 ? r.rachaActual + 1 : 1;
          if (rc && rc.on && N(rc.cada) > 0 && r.rachaActual % N(rc.cada) === 0) { r.pts += N(rc.pts) || 0; r.bonus += N(rc.pts) || 0; r.bonusDet.racha++; }
        } else r.rachaActual = r.rachaActual < 0 ? r.rachaActual - 1 : -1;
        r.rachaMax = Math.max(r.rachaMax, r.rachaActual);
        r.rachaMaxNeg = Math.min(r.rachaMaxNeg, r.rachaActual);
      });
    });
    js.forEach(function (j) { R[j.id].forma = R[j.id].forma.slice(-5); });

    var blyts = ordenar(js.map(function (j) { return B[j.id]; }));
    var real = ordenar(js.map(function (j) { return R[j.id]; }));
    var posB = {}; blyts.forEach(function (r) { posB[r.id] = r.pos; });
    real.forEach(function (r) { r.posBlyts = posB[r.id]; });

    var dias = function (iso) { return iso ? Math.floor((ahora - new Date(iso)) / 864e5) : null; };
    var caidosPend = lista.filter(function (x) { return x.p.estado === "caido"; }).map(function (x) {
      return { p: x.p, dias: dias(x.p.caidoEn), vencido: (cfg.diasRecuperar || 0) > 0 && dias(x.p.caidoEn) > cfg.diasRecuperar };
    });
    var jugados = lista.filter(function (x) { return x.e.real; }).length;

    return { real: real, blyts: blyts, partidos: lista, historial: hist, caidosPendientes: caidosPend,
      resumen: { total: total, jugados: jugados, caidos: lista.filter(function (x) { return x.p.estado === "caido" || x.p.estado === "recuperado"; }).length, pendientesRecuperar: caidosPend.length },
      stats: estadisticas(real, lista, byId) };
  }

  function topBy(rows, f, min) {
    var best = null, who = [];
    rows.forEach(function (r) { var v = f(r); if (v === null || v === undefined || (min !== undefined && v < min)) return;
      if (best === null || v > best) { best = v; who = [r.nombre]; } else if (v === best) who.push(r.nombre); });
    return best === null ? null : { valor: best, jugadores: who };
  }
  function estadisticas(real, lista, byId) {
    var s = [];
    var push = function (clave, titulo, t, fmt, nota) { if (t) s.push({ clave: clave, titulo: titulo, jugadores: t.jugadores, valor: t.valor, texto: fmt(t.valor), nota: nota || "" }); };
    push("racha", "Racha ganadora actual", topBy(real, function (r) { return r.rachaActual; }, 2), function (v) { return v + " seguidos"; });
    push("rachaMax", "Racha más larga del torneo", topBy(real, function (r) { return r.rachaMax; }, 2), function (v) { return v + " seguidos"; });
    push("ganados", "Más partidos ganados", topBy(real, function (r) { return r.pg; }, 1), function (v) { return v + " ganados"; });
    push("perdidos", "Más partidos perdidos", topBy(real, function (r) { return r.pp; }, 1), function (v) { return v + " perdidos"; });
    push("mala", "Racha perdedora actual", topBy(real, function (r) { return -r.rachaActual; }, 2), function (v) { return v + " seguidos"; });
    push("malas", "Más rivales dejados en las malas", topBy(real, function (r) { return r.bonusDet.malas; }, 1), function (v) { return v + " veces"; });
    push("zapatero", "Más zapateros", topBy(real, function (r) { return r.bonusDet.zapatero; }, 1), function (v) { return v + (v === 1 ? " vez" : " veces"); });
    push("tantos", "Mejor promedio de tantos", topBy(real, function (r) { return r.pj ? Math.round(r.tf / r.pj * 10) / 10 : null; }), function (v) { return v + " por partido"; });
    push("caidos", "Más partidos caídos", topBy(real, function (r) { return r.caidos; }, 1), function (v) { return v + (v === 1 ? " partido" : " partidos"); });
    var jug = lista.filter(function (x) { return x.e.real; });
    if (jug.length) {
      var m = jug.map(function (x) { return { x: x, d: Math.abs(x.e.real.ta - x.e.real.tb) }; });
      var mx = m.reduce(function (a, b) { return b.d > a.d ? b : a; }), mn = m.reduce(function (a, b) { return b.d < a.d ? b : a; });
      var desc = function (o) { var p = o.x.p, r = o.x.e.real, w = r.ta > r.tb; return { j: [byId[w ? p.a : p.b].nombre], t: (w ? r.ta : r.tb) + " a " + (w ? r.tb : r.ta) + " contra " + byId[w ? p.b : p.a].nombre }; };
      var a = desc(mx), b = desc(mn);
      s.push({ clave: "paliza", titulo: "Mayor paliza", jugadores: a.j, valor: mx.d, texto: a.t, nota: "" });
      s.push({ clave: "parejo", titulo: "Partido más parejo", jugadores: b.j, valor: mn.d, texto: b.t, nota: "" });
    }
    return s;
  }

  var api = { calcular: calcular, validarResultado: validarResultado, efectivo: efectivo };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TrucoCalc = api;
})(typeof window !== "undefined" ? window : this);
