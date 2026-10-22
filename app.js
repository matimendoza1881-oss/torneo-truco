(function () {
"use strict";
const SUPABASE_URL = "https://vsuxtmyaegbavlyufypb.supabase.co";
const SUPABASE_KEY = "sb_publishable_ykeV-1OV98FHVS0_78nT0w_B-bWfszt";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const S = { torneos: [], actualId: null, jugadores: [], partidos: {}, cargas: [], resumenes: [],
  sesion: null, vista: "posiciones", filtro: "todos", sel: null, form: null, login: null,
  orgMsg: "", ready: false, editing: false, pendingRender: false, online: true };

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const N = v => (v === "" || v === null || v === undefined || isNaN(+v)) ? null : +v;
const fecha = iso => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const tantoTxt = (n, max) => n === null ? "" : n >= max ? "ganó" : n <= max / 2 ? `${n} malas` : `${n - max / 2} buenas`;
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Fecha elegida a mano: se guarda a las 12 del mediodía de ese día (hoy: ahora mismo, para no quedar en el futuro)
const fechaParaGuardar = v => { if (!v) return null; if (v === hoyISO()) return new Date().toISOString(); const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
const setStatus = s => { $("#syncStatus").textContent = s; };
const siteURL = () => location.origin + location.pathname;

// ---------- sesión ----------
try { S.sesion = JSON.parse(lsGet("truco-sesion") || "null"); } catch (e) { S.sesion = null; }
const guardarSesion = s => { S.sesion = s; lsSet("truco-sesion", s ? JSON.stringify(s) : null); };
const esOrg = () => S.sesion && S.sesion.tipo === "org";
const soyId = () => esOrg() ? "org" : (S.sesion && S.sesion.tipo === "jugador" && S.sesion.torneoId === S.actualId ? S.sesion.jugadorId : "");

// ---------- datos ----------
const Traw = () => S.torneos.find(t => t.id === S.actualId) || null;
function T() {
  const t = Traw(); if (!t) return null;
  return { id: t.id, nombre: t.nombre, tantos: t.tantos, ptsV: t.pts_v, ptsD: t.pts_d, diasRecuperar: t.dias_recuperar,
    bonus: t.bonus || {}, inscripcion: t.inscripcion_abierta,
    jugadores: S.jugadores.filter(j => j.activo).map(j => ({ id: j.id, nombre: j.nombre })) };
}
const nombre = id => id === "org" || id === null ? "el organizador" : (S.jugadores.find(j => j.id === id)?.nombre || "?");
const pid = (tid, a, b) => { const [x, y] = a < b ? [a, b] : [b, a]; return `${tid}--${x}--${y}`; };
function fixture() {
  const t = T(); if (!t) return [];
  const js = t.jugadores; const out = [];
  for (let i = 0; i < js.length; i++) for (let k = i + 1; k < js.length; k++) {
    const [a, b] = js[i].id < js[k].id ? [js[i].id, js[k].id] : [js[k].id, js[i].id];
    const id = pid(S.actualId, a, b);
    out.push(S.partidos[id] || { id, a, b, estado: "pendiente" });
  }
  return out;
}
const calc = () => TrucoCalc.calcular(T(), fixture());

async function cargarTorneos() {
  const { data, error } = await sb.from("torneos").select("*").eq("archivado", false).order("creado", { ascending: false });
  if (error) throw error;
  S.torneos = data || [];
  const qs = new URLSearchParams(location.search).get("t");
  const want = [S.actualId, qs, lsGet("truco-actual")].find(id => id && S.torneos.some(t => t.id === id)) || (S.torneos[0] && S.torneos[0].id) || null;
  if (want !== S.actualId) { S.actualId = want; S.sel = null; S.form = null; }
  if (S.actualId) lsSet("truco-actual", S.actualId);
}
async function cargarDetalle() {
  const tid = S.actualId;
  if (!tid) { S.jugadores = []; S.partidos = {}; S.cargas = []; S.resumenes = []; return; }
  const [j, p, c, r] = await Promise.all([
    sb.from("jugadores").select("id,torneo_id,nombre,activo,creado").eq("torneo_id", tid).order("creado"),
    sb.from("partidos").select("*").eq("torneo_id", tid),
    sb.from("cargas").select("*").eq("torneo_id", tid).order("id"),
    sb.from("resumenes").select("*").eq("torneo_id", tid).order("creado", { ascending: false }).limit(3)
  ]);
  for (const x of [j, p, c, r]) if (x.error) throw x.error;
  if (tid !== S.actualId) return;
  S.jugadores = j.data; S.cargas = c.data; S.resumenes = r.data;
  const hist = {};
  c.data.forEach(k => (hist[k.partido_id] = hist[k.partido_id] || []).push({ parte: k.parte, tipo: k.tipo, ta: k.ta, tb: k.tb, por: k.por || "org", cuando: k.cuando }));
  S.partidos = {};
  p.data.forEach(x => {
    S.partidos[x.id] = { id: x.id, a: x.a, b: x.b, estado: x.estado, blyts: x.blyts, rec: x.rec, conf: x.conf || {},
      jugadoEn: x.jugado_en, caidoEn: x.caido_en, recuperadoEn: x.recuperado_en, historial: hist[x.id] || [] };
  });
}
async function recargar(todo) {
  try {
    if (todo) await cargarTorneos();
    await cargarDetalle();
    S.ready = true; S.online = true;
    setStatus(`Actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}${esOrg() ? " · sesión de organizador" : ""}`);
  } catch (e) {
    S.ready = true; S.online = false; setStatus("Sin conexión. Reintentando…");
  }
  suave();
}
let rTimer = null;
const programarRecarga = todo => { clearTimeout(rTimer); rTimer = setTimeout(() => recargar(todo), 350); };

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: "No se pudo conectar. Revisá internet y probá de nuevo." };
  return data || { ok: false, error: "Respuesta vacía." };
}

// ---------- render ----------
function render() {
  const t = T();
  const sel = $("#torneoSel");
  sel.innerHTML = S.torneos.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join("");
  sel.value = S.actualId || ""; sel.hidden = S.torneos.length < 2;
  const me = soyId();
  $("#sesionBox").innerHTML = me ? `<span class="who-chip">${me === "org" ? "Organizador" : esc(nombre(me))}</span> <button class="ghost" id="btnSalir">Salir</button>`
    : (t ? `<button id="btnEntrar">Entrar</button>` : "");
  const bs = $("#btnSalir"); if (bs) bs.onclick = () => { guardarSesion(null); S.form = null; S.sel = null; if (S.vista === "organizar") S.vista = "posiciones"; render(); };
  const be = $("#btnEntrar"); if (be) be.onclick = () => irA("cargar");
  $("#tTitle").textContent = t ? t.nombre : "Tabla real del torneo";
  $("#eyebrow").textContent = t ? `Truco a ${t.tantos} · 1 vs 1 · todos contra todos` : "Torneo de truco · 1 vs 1 · todos contra todos";
  $("#banner").innerHTML = !S.online && S.ready ? `<div class="notice warn">No se pudo conectar con la base. La página reintenta sola.</div>` : "";
  if (!t) { $("#strip").innerHTML = ""; $("#tabs").innerHTML = ""; $("#view").innerHTML = vacio(); bindVacio(); return; }
  const c = calc(); renderStrip(c); renderTabs(c);
  const views = { posiciones: vPosiciones, partidos: vPartidos, stats: vStats, cargar: vCargar, organizar: vOrganizar };
  if (S.vista === "organizar" && !esOrg()) S.vista = "cargar";
  (views[S.vista] || vPosiciones)($("#view"), c);
}
function vacio() {
  if (!S.ready) return `<div class="empty"><p class="muted">Cargando torneos…</p></div>`;
  if (esOrg()) return `<div class="empty"><h2>Todavía no hay torneos</h2><p class="muted">Creá el primero. Los jugadores se pueden inscribir solos desde esta página.</p><button class="primary" id="btnCrear1">Crear torneo</button></div>`;
  return `<div class="empty"><h2>Todavía no hay torneos</h2><p class="muted">Cuando el organizador cree el torneo, acá vas a ver la tabla y vas a poder inscribirte.</p>
    <button class="ghost" id="btnOrgLogin">Soy el organizador</button><div id="orgLoginBox"></div></div>`;
}
function bindVacio() {
  const a = $("#btnCrear1"); if (a) a.onclick = crearTorneo;
  const b = $("#btnOrgLogin"); if (b) b.onclick = () => { $("#orgLoginBox").innerHTML = orgLoginHTML(); bindOrgLogin(); };
}
function renderStrip(c) {
  const t = T(); const lider = c.real[0]; const venc = c.caidosPendientes.filter(x => x.vencido).length;
  const ultAct = S.cargas.length ? S.cargas.reduce((m, k) => k.cuando > m ? k.cuando : m, "") : null;
  $("#strip").innerHTML = `
    <div class="kpi"><span class="eyebrow">Puntero real</span><span class="v">${lider && lider.pj ? esc(lider.nombre) : "—"}</span><span class="s">${lider && lider.pj ? `${lider.pts} pts` : "Sin partidos todavía"}</span></div>
    ${avanceHTML(c, t)}
    <div class="kpi ${c.resumen.pendientesRecuperar ? "alert" : ""}"><span class="eyebrow">Caídos sin recuperar</span><span class="v num">${c.resumen.pendientesRecuperar}</span><span class="s">${venc ? `${venc} pasado${venc > 1 ? "s" : ""} de ${t.diasRecuperar} días` : `${c.resumen.caidos} caído${c.resumen.caidos === 1 ? "" : "s"} en total`}</span></div>
    <div class="kpi"><span class="eyebrow">Última actualización</span><span class="v" style="font-size:18px">${ultAct ? fecha(ultAct) : "—"}</span><span class="s">${ultAct ? "" : "Sin resultados cargados"}</span></div>`;
}
function avanceHTML(c, t) {
  const total = c.resumen.total, jug = c.resumen.jugados, caid = c.resumen.pendientesRecuperar;
  const falta = Math.max(0, total - jug - caid);
  const pct = total ? Math.round(jug / total * 100) : 0;
  const w = n => total ? (n / total * 100) : 0;
  return `<div class="kpi kpi-avance"><span class="eyebrow">Avance del torneo</span>
    <span class="v num">${pct}%</span>
    <div class="bar" role="img" aria-label="${jug} jugados, ${caid} caídos sin recuperar, ${falta} por jugar, de ${total}">
      <i class="seg ok" style="width:${w(jug)}%"></i><i class="seg caid" style="width:${w(caid)}%"></i></div>
    <span class="s"><span class="dot ok"></span>${jug} jugado${jug === 1 ? "" : "s"}${caid ? ` · <span class="dot caid"></span>${caid} caído${caid === 1 ? "" : "s"}` : ""} · ${falta} por jugar · ${total} en total</span></div>`;
}
function renderTabs(c) {
  const tabs = [["posiciones", "Posiciones"], ["partidos", "Partidos"], ["stats", "Estadísticas"], ["cargar", soyId() ? "Cargar resultado" : "Entrar / inscribirme"]];
  if (esOrg()) tabs.push(["organizar", "Organizar"]);
  const me = soyId(); const pend = me && me !== "org" ? c.partidos.filter(x => (x.p.a === me || x.p.b === me) && x.p.estado === "caido").length : 0;
  $("#tabs").innerHTML = tabs.map(([k, l]) => `<a href="#${k}" data-v="${k}" ${S.vista === k ? 'aria-current="page"' : ""}>${l}${k === "cargar" && pend ? `<span class="badge">${pend}</span>` : ""}</a>`).join("");
}
$("#tabs").addEventListener("click", e => { const a = e.target.closest("a[data-v]"); if (!a) return; e.preventDefault(); irA(a.dataset.v); });
function irA(v) { S.vista = v; try { history.replaceState(null, "", location.search + "#" + v); } catch (e) {} render(); window.scrollTo({ top: 0 }); }
$("#torneoSel").onchange = e => { S.actualId = e.target.value; lsSet("truco-actual", S.actualId); S.sel = null; S.form = null; S.jugadores = []; S.partidos = {}; render(); recargar(false); };

// ---------- posiciones ----------
function tablaReal(c) {
  const hayBonus = c.real.some(r => r.bonus);
  return `<div class="panel scroll"><table>
    <thead><tr><th class="l">#</th><th class="l">Jugador</th><th>Pts</th>${hayBonus ? `<th title="Puntos extra incluidos en Pts">Extra</th>` : ""}<th>PJ</th><th>PG</th><th>PP</th><th class="hide-sm">TF</th><th class="hide-sm">TC</th><th>Dif</th><th class="l hide-sm">Forma</th><th title="Puestos respecto de la tabla de Blyts">vs Blyts</th></tr></thead>
    <tbody>${c.real.map((r, i) => { const d = r.posBlyts - r.pos;
      return `<tr class="${i === 0 && r.pj ? "lead" : ""}"><td class="pos l">${r.pos}</td><td class="name l">${esc(r.nombre)}</td><td class="pts">${r.pts}</td>
      ${hayBonus ? `<td class="bon">${r.bonus ? "+" + r.bonus : ""}</td>` : ""}<td class="num">${r.pj}</td><td class="num">${r.pg}</td><td class="num">${r.pp}</td>
      <td class="num hide-sm">${r.tf}</td><td class="num hide-sm">${r.tc}</td><td class="num">${r.dif > 0 ? "+" : ""}${r.dif}</td>
      <td class="l hide-sm"><span class="forma">${r.forma.map(f => `<i class="${f}">${f}</i>`).join("")}</span></td>
      <td class="num">${d > 0 ? `<span class="d-up">▲${d}</span>` : d < 0 ? `<span class="d-down">▼${-d}</span>` : `<span class="d-eq">=</span>`}</td></tr>`; }).join("")}</tbody></table></div>`;
}
function tablaBlyts(c) {
  return `<div class="panel scroll"><table>
    <thead><tr><th class="l">#</th><th class="l">Jugador</th><th>Pts</th><th>PJ</th><th>PG</th><th>PP</th><th>Dif</th></tr></thead>
    <tbody>${c.blyts.map(r => `<tr><td class="pos l">${r.pos}</td><td class="name l">${esc(r.nombre)}</td><td class="pts">${r.pts}</td><td class="num">${r.pj}</td><td class="num">${r.pg}</td><td class="num">${r.pp}</td><td class="num">${r.dif > 0 ? "+" : ""}${r.dif}</td></tr>`).join("")}</tbody></table></div>`;
}
function reglasTxt(t) {
  const b = t.bonus || {}, r = [`${t.ptsV} pt por ganar`];
  if (b.malas?.on) r.push(`+${b.malas.pts} por dejar al rival en las malas`);
  if (b.zapatero?.on) r.push(`+${b.zapatero.pts} por zapatero`);
  if (b.defensivo?.on) r.push(`+${b.defensivo.pts} al que pierde con ${b.defensivo.min} o más`);
  if (b.racha?.on) r.push(`+${b.racha.pts} cada ${b.racha.cada} victorias seguidas`);
  return r.join(" · ");
}
function parteAuto(c) {
  const t = T(); const d = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long" });
  const L = [`*${t.nombre}* · tabla real al ${d}`, ""];
  c.real.forEach(r => L.push(`${r.pos}. ${r.nombre} — ${r.pts} pts (${r.pg}G ${r.pp}P)${r.bonus ? ` · +${r.bonus} extra` : ""}`));
  const ult = c.historial.slice(-3).reverse();
  if (ult.length) { L.push(""); L.push("Últimos: " + ult.map(h => { const aw = h.ta > h.tb; return `${nombre(aw ? h.a : h.b)} ${Math.max(h.ta, h.tb)}-${Math.min(h.ta, h.tb)} ${nombre(aw ? h.b : h.a)}`; }).join(" · ")); }
  if (c.caidosPendientes.length) { L.push(""); L.push("⚠️ Caídos sin recuperar: " + c.caidosPendientes.map(x => `${nombre(x.p.a)} vs ${nombre(x.p.b)} (${x.dias} día${x.dias === 1 ? "" : "s"})`).join(" · ")); }
  const st = c.stats.find(s => s.clave === "ganados") || c.stats[0];
  if (st) { L.push(""); L.push(`🔥 ${st.titulo}: ${st.jugadores.join(", ")} (${st.texto})`); }
  L.push(""); L.push(`Tabla completa: ${siteURL()}`);
  return L.join("\n");
}
function vPosiciones(v, c) {
  const t = T(); const ult = S.resumenes[0];
  const texto = ult ? ult.texto : parteAuto(c);
  v.innerHTML = `<section class="view">
    <div class="two">
      <div class="blk"><div class="blk-head"><div><h2>Tabla real</h2><p class="muted small">Con los partidos caídos corregidos. ${esc(reglasTxt(t))}. Los caídos sin recuperar no cuentan.</p></div></div>${tablaReal(c)}</div>
      <div class="blk"><div class="blk-head"><div><h2>Tabla de Blyts</h2><p class="muted small">Como la muestra la app, contando los resultados automáticos de los partidos caídos.</p></div></div>${tablaBlyts(c)}</div>
    </div>
    ${esOrg() ? `<div class="blk"><div class="blk-head"><div><h2>Parte para el grupo</h2><p class="muted small">${ult ? `Lo escribió el agente programado el ${fecha(ult.creado)}.` : "Se arma solo con los datos de ahora."} Un toque y lo mandás al grupo de WhatsApp.</p></div>
      ${ult ? `<button class="ghost" id="btnParteAhora">Usar la tabla de este momento</button>` : ""}</div>
      <div class="ai-out" id="parteTxt">${esc(texto)}</div>
      <div class="row-actions"><a class="btn wa" id="waLink" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">Mandar por WhatsApp</a><button id="btnCopiar">Copiar texto</button><span class="status" id="copiado"></span></div>
    </div>` : ""}</section>`;
  const pa = $("#btnParteAhora"); if (pa) pa.onclick = () => { const tx = parteAuto(c); $("#parteTxt").textContent = tx; $("#waLink").href = "https://wa.me/?text=" + encodeURIComponent(tx); pa.remove(); };
  if (!esOrg()) return;
  $("#btnCopiar").onclick = async () => { const tx = $("#parteTxt").textContent;
    try { await navigator.clipboard.writeText(tx); $("#copiado").textContent = "Copiado"; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#parteTxt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("#copiado").textContent = "Texto seleccionado, copialo a mano"; } };
}

// ---------- partidos ----------
function vPartidos(v, c) {
  const f = S.filtro;
  const items = c.partidos.filter(x => f === "todos" ? x.p.estado !== "pendiente" : f === "caidos" ? (x.p.estado === "caido" || x.p.estado === "recuperado") : f === "pendientes" ? x.p.estado === "pendiente" : x.p.estado === "jugado")
    .sort((x, y) => String(y.e.cuando || "").localeCompare(String(x.e.cuando || "")));
  const pend = c.partidos.filter(x => x.p.estado === "pendiente").length;
  v.innerHTML = `<section class="view"><div class="blk">
    <div class="chips" role="group" aria-label="Filtro">${[["todos", "Todos los jugados"], ["normales", "Sin incidentes"], ["caidos", "Caídos"], ["pendientes", `Por jugar (${pend})`]].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${items.length ? `<div class="panel mlist">${items.map(x => matchHTML(x, c)).join("")}</div>` : `<div class="empty"><p class="muted">No hay partidos en esta lista.</p></div>`}
  </div></section>`;
  v.querySelectorAll(".chip").forEach(b => b.onclick = () => { S.filtro = b.dataset.f; render(); });
}
function ultimaCarga(p, parte) { return [...(p.historial || [])].reverse().find(h => h.parte === parte); }
function confTxt(p) {
  const parte = p.estado === "recuperado" ? "rec" : "blyts"; const k = p.conf && p.conf[parte];
  if (k) return `✓ confirmado por ${esc(nombre(k.por))}`;
  const u = ultimaCarga(p, parte); if (!u) return "";
  return `cargó ${esc(nombre(u.por))} · sin confirmar`;
}
function matchHTML(x, c) {
  const p = x.p, e = x.e, A = nombre(p.a), B = nombre(p.b);
  if (p.estado === "pendiente") return `<div class="match"><span class="pl">${esc(A)}</span><span class="score muted">vs</span><span class="pl r">${esc(B)}</span></div>`;
  const r = e.real; const show = r || e.blyts; if (!show) return "";
  const aw = show.ta > show.tb; const tags = [];
  if (p.estado === "caido") { const cp = c.caidosPendientes.find(z => z.p.id === p.id); tags.push(`<span class="tag caido">Caído · falta recuperar</span>`); if (cp && cp.vencido) tags.push(`<span class="tag venc">${cp.dias} días sin recuperar</span>`); }
  if (p.estado === "recuperado") tags.push(`<span class="tag rec">Recuperado</span><span>Blyts había dado <s class="old">${e.blyts ? `${e.blyts.ta}-${e.blyts.tb}` : "?"}</s></span>`);
  [...x.bonusA.map(z => [A, z]), ...x.bonusB.map(z => [B, z])].forEach(([n, z]) => tags.push(`<span class="tag bonus">${esc(n)} +${z.pts} ${esc(z.txt)}</span>`));
  const conf = confTxt(p);
  return `<div class="match">
    <span class="pl ${r ? (aw ? "w" : "lo") : ""}">${esc(A)}</span>
    <span class="score">${p.estado === "caido" ? `<s class="old">${show.ta} - ${show.tb}</s>` : `${show.ta} - ${show.tb}`}</span>
    <span class="pl r ${r ? (!aw ? "w" : "lo") : ""}">${esc(B)}</span>
    <div class="meta"><span>${fecha(e.cuando)}</span>${tags.join("")}${conf ? `<span>${conf}</span>` : ""}</div></div>`;
}

// ---------- estadísticas ----------
function vStats(v, c) {
  const s = c.stats;
  v.innerHTML = `<section class="view"><div class="blk"><div class="blk-head"><div><h2>Estadísticas</h2><p class="muted small">Calculadas sobre la tabla real, en el orden en que se jugaron los partidos.</p></div></div>
  ${s.length ? `<div class="stats">${s.map(x => `<div class="stat"><span class="eyebrow">${esc(x.titulo)}</span><span class="who">${esc(x.jugadores.join(", "))}</span><span class="what num">${esc(x.texto)}</span></div>`).join("")}</div>`
    : `<div class="empty"><p class="muted">Las estadísticas aparecen cuando haya partidos cargados.</p></div>`}</div>
  <div class="blk"><h2>Forma de cada jugador</h2><div class="panel scroll"><table><thead><tr><th class="l">Jugador</th><th class="l">Últimos 5</th><th>Racha</th><th>Mejor racha</th><th>En las malas</th><th>Zapateros</th><th>Caídos</th></tr></thead>
  <tbody>${c.real.map(r => `<tr><td class="l name">${esc(r.nombre)}</td><td class="l"><span class="forma">${r.forma.map(f => `<i class="${f}">${f}</i>`).join("")}</span></td>
   <td class="num ${r.rachaActual > 0 ? "d-up" : r.rachaActual < 0 ? "d-down" : ""}">${r.rachaActual > 0 ? r.rachaActual + " G" : r.rachaActual < 0 ? (-r.rachaActual) + " P" : "–"}</td><td class="num">${r.rachaMax || "–"}</td><td class="num">${r.bonusDet.malas}</td><td class="num">${r.bonusDet.zapatero}</td><td class="num">${r.caidos}</td></tr>`).join("")}</tbody></table></div></div></section>`;
}

// ---------- entrar / inscribirse ----------
function orgLoginHTML() {
  return `<div class="login"><label class="lbl">Clave de organizador<input id="orgKey" type="password" autocomplete="current-password"></label>
    <div class="row-actions"><button class="primary" id="btnOrgOk">Entrar como organizador</button></div><div class="small" id="orgErr"></div></div>`;
}
function bindOrgLogin() {
  const go = async () => { const k = $("#orgKey").value.trim(); if (!k) return; $("#btnOrgOk").disabled = true;
    const r = await rpc("verificar_admin", { p_admin: k });
    if (r.ok) { guardarSesion({ tipo: "org", admin: k }); S.vista = Traw() ? "organizar" : S.vista; render(); recargar(true); }
    else { $("#orgErr").innerHTML = `<span class="d-down">${esc(r.error)}</span>`; $("#btnOrgOk").disabled = false; } };
  $("#btnOrgOk").onclick = go; $("#orgKey").onkeydown = e => { if (e.key === "Enter") go(); };
}
function vLogin(v) {
  const t = T(); const L = S.login || (S.login = { modo: "entrar", jugador: "", nombre: "", pin: "", pin2: "", msg: "" });
  const js = t.jugadores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  v.innerHTML = `<section class="view"><div class="two">
    <div class="blk"><h2>Entrar con tu PIN</h2>
      ${js.length ? `<div class="panel login">
        <label class="lbl">Jugador<select id="lgJug"><option value="">Elegí tu nombre…</option>${js.map(j => `<option value="${j.id}" ${L.jugador === j.id ? "selected" : ""}>${esc(j.nombre)}</option>`).join("")}</select></label>
        <label class="lbl">PIN<input class="pin" id="lgPin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" value="${esc(L.pin)}"></label>
        <div class="row-actions"><button class="primary" id="btnLg">Entrar</button></div><div class="small" id="lgMsg">${L.modo === "entrar" ? L.msg : ""}</div>
        <p class="small muted">Queda guardado en este dispositivo hasta que toques Salir.</p></div>` : `<div class="empty"><p class="muted">Todavía no hay jugadores inscriptos.</p></div>`}
    </div>
    <div class="blk"><h2>${t.inscripcion ? "Inscribirme al torneo" : "Inscripción cerrada"}</h2>
      ${t.inscripcion ? `<div class="panel login">
        <label class="lbl">Tu nombre o apodo en Blyts<input id="inNom" maxlength="30" autocomplete="nickname" value="${esc(L.nombre)}"></label>
        <label class="lbl">Elegí un PIN de 4 números<input class="pin" id="inPin" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password" value="${esc(L.pin2)}"></label>
        <div class="row-actions"><button class="primary" id="btnIn">Inscribirme</button></div><div class="small" id="inMsg">${L.modo === "inscribir" ? L.msg : ""}</div>
        <p class="small muted">Con ese PIN vas a cargar tus resultados. No se lo pases a nadie.</p></div>`
        : `<div class="empty"><p class="muted">Si te tienen que sumar, pedíselo al organizador.</p></div>`}
      <button class="ghost" id="btnOrgLogin" style="align-self:flex-start">Soy el organizador</button><div id="orgLoginBox"></div>
    </div></div></section>`;
  const on = (id, ev, fn) => { const el = $("#" + id); if (el) el[ev] = fn; };
  on("lgJug", "onchange", e => { L.jugador = e.target.value; });
  on("lgPin", "oninput", e => { L.pin = e.target.value.replace(/\D/g, "").slice(0, 4); e.target.value = L.pin; });
  on("inNom", "oninput", e => { L.nombre = e.target.value; });
  on("inPin", "oninput", e => { L.pin2 = e.target.value.replace(/\D/g, "").slice(0, 4); e.target.value = L.pin2; });
  const entrar = async () => {
    if (!L.jugador) { L.modo = "entrar"; L.msg = `<span class="d-down">Elegí tu nombre.</span>`; return render(); }
    if (!/^\d{4}$/.test(L.pin)) { L.modo = "entrar"; L.msg = `<span class="d-down">El PIN tiene 4 números.</span>`; return render(); }
    $("#btnLg").disabled = true;
    const r = await rpc("verificar_pin", { p_jugador: L.jugador, p_pin: L.pin });
    if (r.ok) { guardarSesion({ tipo: "jugador", torneoId: S.actualId, jugadorId: L.jugador, pin: L.pin }); S.login = null; render(); }
    else { L.modo = "entrar"; L.msg = `<span class="d-down">${esc(r.error)}</span>`; render(); }
  };
  on("btnLg", "onclick", entrar); on("lgPin", "onkeydown", e => { if (e.key === "Enter") entrar(); });
  on("btnIn", "onclick", async () => {
    if (!L.nombre.trim()) { L.modo = "inscribir"; L.msg = `<span class="d-down">Escribí tu nombre.</span>`; return render(); }
    if (!/^\d{4}$/.test(L.pin2)) { L.modo = "inscribir"; L.msg = `<span class="d-down">El PIN tiene que tener 4 números.</span>`; return render(); }
    $("#btnIn").disabled = true;
    const r = await rpc("inscribirse", { p_torneo: S.actualId, p_nombre: L.nombre.trim(), p_pin: L.pin2 });
    if (r.ok) { guardarSesion({ tipo: "jugador", torneoId: S.actualId, jugadorId: r.id, pin: L.pin2 }); S.login = null; await recargar(false); }
    else { L.modo = "inscribir"; L.msg = `<span class="d-down">${esc(r.error)}</span>`; render(); }
  });
  on("btnOrgLogin", "onclick", () => { $("#orgLoginBox").innerHTML = orgLoginHTML(); bindOrgLogin(); });
}

// ---------- cargar resultado ----------
function estadoTxt(p) { return { pendiente: "Por jugar", jugado: "Jugado", caido: "Caído · falta recuperar", recuperado: "Recuperado" }[p.estado]; }
function ladoDe(p, me) { return (me === "org" || p.a === me) ? { yo: p.a, rival: p.b } : { yo: p.b, rival: p.a }; }
function vCargar(v, c) {
  const me = soyId(); if (!me) return vLogin(v);
  const lista = c.partidos.filter(x => me === "org" || x.p.a === me || x.p.b === me);
  const orden = { caido: 0, pendiente: 1, jugado: 2, recuperado: 3 };
  lista.sort((x, y) => orden[x.p.estado] - orden[y.p.estado]);
  const selX = lista.find(x => x.p.id === S.sel);
  v.innerHTML = `<section class="view"><div class="two">
    <div class="blk"><div class="blk-head"><div><h2>${me === "org" ? "Todos los partidos" : "Tus partidos"}</h2><p class="muted small">Elegí el partido que querés cargar.</p></div></div>
      <div class="panel mine">${lista.map(x => { const p = x.p; const riv = me === "org" ? `${esc(nombre(p.a))} vs ${esc(nombre(p.b))}` : esc(nombre(p.a === me ? p.b : p.a));
        const sc = x.e.real || x.e.blyts; const yo = me === "org" || p.a === me;
        const scTxt = sc ? (yo ? `${sc.ta}-${sc.tb}` : `${sc.tb}-${sc.ta}`) : "";
        return `<button class="row" data-pid="${p.id}" aria-pressed="${S.sel === p.id}"><span class="rv">${me === "org" ? "" : "vs "}${riv}</span><span class="st"><span class="num">${scTxt}</span><br><span class="tag ${p.estado === "caido" ? "caido" : p.estado === "recuperado" ? "rec" : ""}">${estadoTxt(p)}</span></span></button>`; }).join("") || `<p class="muted" style="padding:14px">Todavía no hay rivales. Esperá a que se inscriban los demás.</p>`}</div></div>
    <div class="blk" id="formBox">${selX ? formHTML(selX, me) : `<div class="empty"><p class="muted">Elegí un partido de la lista.</p></div>`}</div>
  </div></section>`;
  v.querySelectorAll("button.row").forEach(b => b.onclick = () => { S.sel = b.dataset.pid; S.form = null; render(); if (innerWidth < 820) $("#formBox").scrollIntoView({ behavior: "smooth" }); });
  if (selX) bindForm(selX, me);
}
function confLine(p, parte, me) {
  const k = p.conf && p.conf[parte]; if (k) return `<span class="small d-up">✓ Confirmado por ${esc(nombre(k.por))}</span>`;
  const u = ultimaCarga(p, parte); if (!u) return "";
  const puedo = me && me !== "org" && me !== u.por && (p.a === me || p.b === me);
  return `<span class="small muted">Cargado por ${esc(nombre(u.por))}, sin confirmar.</span>${puedo ? `<button class="ghost" style="color:var(--paño);padding-left:0" data-conf="${parte}">✓ Confirmo este resultado</button>` : ""}`;
}
function formHTML(x, me) {
  const p = x.p, t = T(); const { yo, rival } = ladoDe(p, me);
  const val = (obj, id) => obj ? (id === p.a ? obj.ta : obj.tb) : null;
  if (!S.form || S.form.pid !== p.id) S.form = { pid: p.id, modo: p.estado === "caido" ? "rec" : p.estado === "pendiente" ? "nuevo" : "ver", tipo: "jugado", yo: null, rival: null, fecha: "", msg: "", saving: false };
  const f = S.form; const yoN = nombre(yo), rivN = nombre(rival);
  const head = `<div class="blk-head"><div><span class="eyebrow">${estadoTxt(p)}</span><h2>${esc(yoN)} vs ${esc(rivN)}</h2></div></div>`;
  const blytsBox = p.blyts ? `<div class="res-shown"><span class="eyebrow">${p.estado === "jugado" ? "Resultado" : "Lo que dio Blyts al caerse"}</span><span class="score" style="text-align:left">${esc(yoN)} ${val(p.blyts, yo)} - ${val(p.blyts, rival)} ${esc(rivN)}</span>${confLine(p, "blyts", me)}</div>` : "";
  const recBox = p.rec ? `<div class="res-shown"><span class="eyebrow">Partido recuperado</span><span class="score" style="text-align:left">${esc(yoN)} ${val(p.rec, yo)} - ${val(p.rec, rival)} ${esc(rivN)}</span>${confLine(p, "rec", me)}</div>` : "";
  const hist = (p.historial || []).length ? `<details><summary class="small">Historial de cargas</summary><ul class="hist">${p.historial.map(h => `<li>${fecha(h.cuando)} · ${h.por === "org" ? "Organizador" : esc(nombre(h.por))} cargó ${h.parte === "rec" ? "el recuperado" : h.tipo === "caido" ? "caído" : "resultado"} ${val(h, yo)}-${val(h, rival)}</li>`).join("")}</ul></details>` : "";
  if (f.modo === "ver") {
    return `<div class="panel form">${head}${blytsBox}${recBox}
      <div class="row-actions"><button id="btnCorregir">${p.estado === "recuperado" ? "Corregir lo que dio Blyts" : "Corregir resultado"}</button>${p.estado === "jugado" ? `<button id="btnFueCaido">En realidad se cayó</button>` : ""}${p.estado === "recuperado" ? `<button id="btnCorregirRec">Corregir el recuperado</button>` : ""}</div>${hist}</div>`;
  }
  const titulo = f.modo === "rec" ? "Cargá el resultado del partido recuperado" : f.modo === "nuevo" ? "¿Cómo terminó el partido en Blyts?" : "Corregir resultado";
  const tipoSel = f.modo === "rec" ? "" : `<div class="seg" role="group" aria-label="Tipo"><button data-tipo="jugado" aria-pressed="${f.tipo === "jugado"}">Se jugó completo</button><button data-tipo="caido" aria-pressed="${f.tipo === "caido"}">Se cayó y la app dio un resultado</button></div>`;
  const ayuda = f.modo === "rec" ? `<p class="small muted">Jugaron de nuevo en un 1 vs 1 simple. Este resultado reemplaza al de Blyts en la tabla real.</p>`
    : f.tipo === "caido" ? `<p class="small muted">Cargá el resultado que puso la app cuando se cortó (por ejemplo ${t.tantos} a 0). No cuenta en la tabla real hasta que carguen el recuperado.</p>` : "";
  return `<div class="panel form">${head}${f.modo === "rec" ? blytsBox : ""}
    <h3>${titulo}</h3>${tipoSel}${ayuda}
    <div class="duo">
      <div class="side"><span class="nm">${esc(yoN)}</span><input class="big" id="fYo" type="number" inputmode="numeric" min="0" max="${t.tantos}" value="${f.yo ?? ""}" aria-label="Tantos de ${esc(yoN)}"><span class="tanto" id="tYo">${tantoTxt(N(f.yo), t.tantos)}</span></div>
      <span class="x">a</span>
      <div class="side"><span class="nm">${esc(rivN)}</span><input class="big" id="fRiv" type="number" inputmode="numeric" min="0" max="${t.tantos}" value="${f.rival ?? ""}" aria-label="Tantos de ${esc(rivN)}"><span class="tanto" id="tRiv">${tantoTxt(N(f.rival), t.tantos)}</span></div>
    </div>
    <label class="lbl fecha">${f.modo === "rec" ? "¿Cuándo se recuperó?" : "¿Cuándo se jugó?"} <span class="opt">opcional</span>
      <input type="date" id="fFecha" value="${esc(f.fecha)}" max="${hoyISO()}"><span class="small muted">Si lo dejás vacío, ${f.modo === "corregir" ? "se mantiene la fecha que ya tenía" : "se toma el momento en que lo cargás"}.</span></label>
    <div id="fMsg" class="small">${f.msg}</div>
    <div class="row-actions"><button class="primary" id="btnGuardar" ${f.saving ? "disabled" : ""}>${f.saving ? "Guardando…" : "Guardar resultado"}</button>${p.estado !== "pendiente" && !(f.modo === "rec" && p.estado === "caido") ? `<button class="ghost" id="btnCancelar">Cancelar</button>` : ""}</div>
    ${f.modo === "rec" ? "" : recBox}${hist}</div>`;
}
function bindForm(x, me) {
  const p = x.p, f = S.form, t = T();
  const on = (id, ev, fn) => { const el = $("#" + id); if (el) el[ev] = fn; };
  const { yo, rival } = ladoDe(p, me);
  const pre = obj => { f.yo = obj ? (yo === p.a ? obj.ta : obj.tb) : null; f.rival = obj ? (rival === p.a ? obj.ta : obj.tb) : null; };
  on("btnCorregir", "onclick", () => { f.modo = "corregir"; f.tipo = p.estado === "jugado" ? "jugado" : "caido"; pre(p.blyts); render(); });
  on("btnCorregirRec", "onclick", () => { f.modo = "rec"; pre(p.rec); render(); });
  on("btnFueCaido", "onclick", () => { f.modo = "corregir"; f.tipo = "caido"; pre(p.blyts); render(); });
  on("btnCancelar", "onclick", () => { S.form = null; render(); });
  document.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => { f.tipo = b.dataset.tipo; render(); });
  document.querySelectorAll("[data-conf]").forEach(b => b.onclick = async () => { b.disabled = true;
    const r = await rpc("confirmar_resultado", { p_partido: p.id, p_parte: b.dataset.conf, p_jugador: me, p_pin: S.sesion.pin });
    if (!r.ok) { f.msg = `<span class="d-down">${esc(r.error)}</span>`; sesionInvalida(r.error); }
    recargar(false); });
  on("fYo", "oninput", e => { f.yo = e.target.value; $("#tYo").textContent = tantoTxt(N(f.yo), t.tantos); });
  on("fFecha", "onchange", e => { f.fecha = e.target.value; });
  on("fRiv", "oninput", e => { f.rival = e.target.value; $("#tRiv").textContent = tantoTxt(N(f.rival), t.tantos); });
  on("btnGuardar", "onclick", async () => {
    const err = TrucoCalc.validarResultado(t.tantos, N(f.yo), N(f.rival));
    if (err) { f.msg = `<span class="d-down">${esc(err)}</span>`; return render(); }
    f.saving = true; f.msg = ""; render();
    const tipo = f.modo === "rec" ? "rec" : f.tipo;
    if (f.fecha && f.fecha > hoyISO()) { f.saving = false; f.msg = `<span class="d-down">La fecha no puede ser futura.</span>`; return render(); }
    const args = { p_torneo: S.actualId, p_a: yo, p_b: rival, p_tipo: tipo, p_ta: N(f.yo), p_tb: N(f.rival), p_fecha: fechaParaGuardar(f.fecha) };
    if (me === "org") args.p_admin = S.sesion.admin; else { args.p_jugador = me; args.p_pin = S.sesion.pin; }
    const r = await rpc("registrar_resultado", args);
    if (r.ok) { S.form = null; await recargar(false); }
    else { f.saving = false; f.msg = `<span class="d-down">${esc(r.error)}</span>`; sesionInvalida(r.error); render(); }
  });
}
function sesionInvalida(msg) {
  if (/PIN incorrecto|Clave de organizador incorrecta/.test(msg || "")) { guardarSesion(null); S.form = null; S.sel = null; S.login = { modo: "entrar", jugador: "", nombre: "", pin: "", pin2: "", msg: `<span class="d-down">Tu PIN cambió. Volvé a entrar.</span>` }; render(); }
}

// ---------- organizar ----------
let cfgTimer = null;
async function adminRpc(accion, datos) {
  const r = await rpc("admin_torneo", { p_admin: S.sesion.admin, p_accion: accion, p_datos: datos });
  if (!r.ok) sesionInvalida(r.error);
  return r;
}
function guardarCfg(campos) {
  const t = Traw(); Object.assign(t, campos); setStatus("Guardando…");
  clearTimeout(cfgTimer); cfgTimer = setTimeout(async () => {
    const r = await adminRpc("actualizar", { id: t.id, nombre: t.nombre, tantos: t.tantos, pts_v: t.pts_v, pts_d: t.pts_d, dias_recuperar: t.dias_recuperar, bonus: t.bonus, inscripcion_abierta: t.inscripcion_abierta });
    setStatus(r.ok ? "Guardado" : r.error); cfgTimer = null; }, 600);
}
function vOrganizar(v, c) {
  const t = Traw(); const b = t.bonus || (t.bonus = {});
  const bon = (k, titulo, desc, extra = "") => `<div class="bonusrow"><input type="checkbox" id="b-${k}-on" ${b[k]?.on ? "checked" : ""} aria-label="${titulo}"><div class="t"><b>${titulo}</b><span class="small muted">${desc}</span></div>${extra}<label class="lbl">Puntos<input class="n" id="b-${k}-pts" type="number" value="${b[k]?.pts ?? 1}"></label></div>`;
  const link = `${siteURL()}?t=${t.id}`;
  const activos = S.jugadores.filter(j => j.activo);
  v.innerHTML = `<section class="view">
    <div class="blk"><h2>Inscripción</h2>
      <div class="bonusrow panel"><input type="checkbox" id="o-insc" ${t.inscripcion_abierta ? "checked" : ""} aria-label="Inscripción abierta"><div class="t"><b>Inscripción abierta</b><span class="small muted">Cada jugador se suma solo, con su nombre de Blyts y un PIN que elige. Cerrala cuando arranque el torneo.</span></div></div>
      <p class="small">Link para el grupo: <span class="num" id="linkTxt">${esc(link)}</span> <button class="ghost" id="btnCopLink">Copiar</button></p></div>
    <div class="blk"><h2>Torneo</h2><div class="cfg">
      <label class="lbl">Nombre<input id="o-nombre" value="${esc(t.nombre)}"></label>
      <label class="lbl">Partidos a<select id="o-tantos">${[15, 30, 40].map(n => `<option value="${n}" ${t.tantos === n ? "selected" : ""}>${n} tantos</option>`).join("")}</select></label>
      <label class="lbl">Puntos por ganar<input class="n" id="o-pts_v" type="number" value="${t.pts_v}"></label>
      <label class="lbl">Puntos por perder<input class="n" id="o-pts_d" type="number" value="${t.pts_d}"></label>
      <label class="lbl">Días para recuperar un caído<input class="n" id="o-dias_recuperar" type="number" value="${t.dias_recuperar}"></label>
    </div><p class="small muted">Poné los mismos puntos que el torneo de Blyts para que la tabla de Blyts coincida con la de la app.</p></div>
    <div class="blk"><h2>Jugadores (${activos.length})</h2>
      <div class="plist">${activos.map(j => `<div class="pr"><input id="pj-${j.id}" data-jug="${j.id}" value="${esc(j.nombre)}" aria-label="Nombre"><button class="ghost" data-reset="${j.id}">Nuevo PIN</button><button class="ghost" data-baja="${j.id}" aria-label="Dar de baja a ${esc(j.nombre)}">✕</button></div>`).join("") || `<p class="muted small">Nadie se inscribió todavía.</p>`}</div>
      <div class="row-actions"><input id="nuevoJug" placeholder="Sumar a alguien a mano"><button id="btnAddJug">+ Agregar</button></div>
      <div class="small" id="jugMsg">${S.orgMsg}</div></div>
    <div class="blk"><h2>Puntos extra</h2><p class="small muted">Solo cuentan en la tabla real. Se aplican al resultado válido de cada partido (el recuperado, si se cayó).</p>
      <div class="panel">
        ${bon("malas", "En las malas", `El ganador deja al rival con ${t.tantos / 2} o menos.`)}
        ${bon("zapatero", "Zapatero", "El ganador deja al rival en 0. Se suma al de las malas.")}
        ${bon("defensivo", "Perder peleando", "El que pierde llega a cierta cantidad de tantos.", `<label class="lbl">Desde<input class="n" id="b-defensivo-min" type="number" value="${b.defensivo?.min ?? t.tantos - 5}"></label>`)}
        ${bon("racha", "Racha", "Cada tantas victorias seguidas.", `<label class="lbl">Cada<input class="n" id="b-racha-cada" type="number" value="${b.racha?.cada ?? 3}"></label>`)}
      </div></div>
    <div class="blk"><h2>Torneos</h2><div class="row-actions"><button id="btnNuevoT">+ Nuevo torneo</button><button class="ghost" id="btnArch">Archivar este torneo</button><span id="archConf"></span></div></div>
  </section>`;
  const vw = $("#view");
  vw.oninput = e => { const el = e.target, id = el.id;
    if (id === "o-nombre") { guardarCfg({ nombre: el.value }); $("#tTitle").textContent = el.value; }
    else if (/^o-(pts_v|pts_d|dias_recuperar)$/.test(id)) guardarCfg({ [id.slice(2)]: N(el.value) ?? 0 });
    else { const m = id.match(/^b-(\w+)-(pts|min|cada)$/); if (m) { b[m[1]] = b[m[1]] || {}; b[m[1]][m[2]] = N(el.value) ?? 0; guardarCfg({ bonus: b }); } } };
  vw.onchange = e => { const el = e.target;
    if (el.id === "o-tantos") { guardarCfg({ tantos: +el.value }); render(); }
    else if (el.id === "o-insc") guardarCfg({ inscripcion_abierta: el.checked });
    else if (el.dataset.jug) { const nm = el.value.trim(); if (nm) adminRpc("renombrar", { id: el.dataset.jug, nombre: nm }).then(r => { S.orgMsg = r.ok ? "" : `<span class="d-down">${esc(r.error)}</span>`; recargar(false); }); }
    else { const m = el.id.match(/^b-(\w+)-on$/); if (m) { b[m[1]] = b[m[1]] || { pts: 1 }; b[m[1]].on = el.checked; guardarCfg({ bonus: b }); } } };
  $("#btnCopLink").onclick = async () => { try { await navigator.clipboard.writeText(link); $("#btnCopLink").textContent = "Copiado"; } catch (e) {} };
  $("#btnAddJug").onclick = async () => { const n = $("#nuevoJug").value.trim(); if (!n) return;
    const r = await adminRpc("agregar_jugador", { torneo_id: t.id, nombre: n });
    S.orgMsg = r.ok ? `${esc(n)} quedó sumado con el PIN <span class="pinshow">${r.pin}</span>. Pasáselo por privado; no se vuelve a mostrar.` : `<span class="d-down">${esc(r.error)}</span>`;
    await recargar(false); };
  $("#nuevoJug").onkeydown = e => { if (e.key === "Enter") $("#btnAddJug").click(); };
  vw.querySelectorAll("[data-reset]").forEach(btn => btn.onclick = async () => {
    if (!btn.dataset.ok) { btn.dataset.ok = "1"; btn.textContent = "¿Generar PIN nuevo?"; return; }
    const r = await adminRpc("reset_pin", { id: btn.dataset.reset });
    S.orgMsg = r.ok ? `Nuevo PIN de ${esc(nombre(btn.dataset.reset))}: <span class="pinshow">${r.pin}</span>. Pasáselo por privado.` : `<span class="d-down">${esc(r.error)}</span>`; render(); });
  vw.querySelectorAll("[data-baja]").forEach(btn => btn.onclick = async () => {
    if (!btn.dataset.ok) { btn.dataset.ok = "1"; btn.textContent = "¿Dar de baja? Sus partidos dejan de contar"; btn.classList.add("danger"); return; }
    const r = await adminRpc("baja_jugador", { id: btn.dataset.baja }); S.orgMsg = r.ok ? "" : `<span class="d-down">${esc(r.error)}</span>`; recargar(false); });
  $("#btnNuevoT").onclick = crearTorneo;
  $("#btnArch").onclick = () => { $("#archConf").innerHTML = `<span class="small">Deja de verse para todos.</span> <button class="danger" id="btnArchOk">Sí, archivar</button>`;
    $("#btnArchOk").onclick = async () => { const r = await adminRpc("archivar", { id: t.id }); if (r.ok) { S.actualId = null; S.vista = "posiciones"; await recargar(true); } }; };
}
async function crearTorneo() {
  const n = S.torneos.length + 1;
  const r = await adminRpc("crear", { nombre: `Torneo ${n}` });
  if (r.ok) { S.actualId = r.id; lsSet("truco-actual", r.id); S.vista = "organizar"; S.orgMsg = "Torneo creado. Pasá el link al grupo para que se inscriban."; await recargar(true); }
  else setStatus(r.error);
}

// ---------- tiempo real ----------
function suave() { if (S.editing) { S.pendingRender = true; return; } render(); }
const appEl = $("#app");
appEl.addEventListener("focusin", e => { if (e.target.matches("input,textarea,select")) S.editing = true; });
appEl.addEventListener("focusout", () => { S.editing = false; setTimeout(() => { if (!S.editing && S.pendingRender) { S.pendingRender = false; render(); } }, 80); });

sb.channel("torneo")
  .on("postgres_changes", { event: "*", schema: "public", table: "torneos" }, () => programarRecarga(true))
  .on("postgres_changes", { event: "*", schema: "public", table: "partidos" }, p => { if ((p.new && p.new.torneo_id) === S.actualId) programarRecarga(false); })
  .on("postgres_changes", { event: "*", schema: "public", table: "cargas" }, p => { if ((p.new && p.new.torneo_id) === S.actualId) programarRecarga(false); })
  .on("postgres_changes", { event: "*", schema: "public", table: "resumenes" }, p => { if ((p.new && p.new.torneo_id) === S.actualId) programarRecarga(false); })
  .subscribe();
setInterval(() => { if (!document.hidden) recargar(true); }, 90000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) recargar(true); });

const h = (location.hash || "").slice(1); if (["posiciones", "partidos", "stats", "cargar", "organizar"].includes(h)) S.vista = h;
render();
recargar(true);
})();
