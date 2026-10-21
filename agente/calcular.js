#!/usr/bin/env node
// Uso: node agente/calcular.js datos.json   (datos.json = el objeto "datos" de agente/datos.sql)
// Imprime la tabla real, la de Blyts, los caídos sin recuperar y las estadísticas, con la misma fórmula que la página.
const fs = require("fs");
const C = require("../calc.js");
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const t = d.torneo;
const torneo = { nombre: t.nombre, tantos: t.tantos, ptsV: t.pts_v, ptsD: t.pts_d, diasRecuperar: t.dias_recuperar, bonus: t.bonus || {}, jugadores: d.jugadores };
const partidos = (d.partidos || []).map(p => ({ id: p.id, a: p.a, b: p.b, estado: p.estado, blyts: p.blyts, rec: p.rec,
  jugadoEn: p.jugado_en, caidoEn: p.caido_en, recuperadoEn: p.recuperado_en }));
const r = C.calcular(torneo, partidos);
const nom = Object.fromEntries(d.jugadores.map(j => [j.id, j.nombre]));
const out = {
  torneo: t.nombre, torneo_id: t.id,
  hubo_cambios_desde_ultimo_parte: !d.ultimo_parte || (d.ultima_carga && d.ultima_carga > d.ultimo_parte),
  partidos_jugados: `${r.resumen.jugados}/${r.resumen.total}`,
  tabla_real: r.real.map(x => ({ pos: x.pos, jugador: x.nombre, pts: x.pts, extra: x.bonus, pj: x.pj, pg: x.pg, pp: x.pp, dif: x.dif, racha: x.rachaActual, puesto_en_blyts: x.posBlyts })),
  tabla_blyts: r.blyts.map(x => ({ pos: x.pos, jugador: x.nombre, pts: x.pts, pj: x.pj })),
  ultimos_resultados: r.historial.slice(-5).reverse().map(h => `${nom[h.a]} ${h.ta}-${h.tb} ${nom[h.b]}`),
  caidos_sin_recuperar: r.caidosPendientes.map(x => ({ partido: `${nom[x.p.a]} vs ${nom[x.p.b]}`, dias: x.dias, vencido: x.vencido })),
  estadisticas: r.stats.map(s => `${s.titulo}: ${s.jugadores.join(", ")} (${s.texto})`),
  tabla_para_guardar: r.real.map(x => ({ id: x.id, pos: x.pos, pts: x.pts }))
};
console.log(JSON.stringify(out, null, 2));
