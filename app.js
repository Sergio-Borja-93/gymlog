// ---------- Almacenamiento (IndexedDB, un solo documento) ----------
const DB = {
  db: null,
  open() {
    return new Promise((ok, err) => {
      const r = indexedDB.open("gymlog", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this.db = r.result; ok(); };
      r.onerror = () => err(r.error);
    });
  },
  get(k) {
    return new Promise(ok => {
      const r = this.db.transaction("kv").objectStore("kv").get(k);
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
    });
  },
  set(k, v) {
    return new Promise(ok => {
      const t = this.db.transaction("kv", "readwrite");
      t.objectStore("kv").put(v, k); t.oncomplete = ok;
    });
  }
};

const GRUPOS = ["Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", "Cuádriceps", "Isquiotibiales", "Gemelos", "Glúteos", "Core", "Cardio", "Otro"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]; // semana empezando el lunes
const SEMANA = [
  ["Cuádriceps y gemelos", [1], ["Sentadilla", "Prensa", "Extensión de cuádriceps", "Zancadas", "Elevación de talones de pie", "Elevación de talones sentado"]],
  ["Espalda, hombro y bíceps", [2], ["Dominadas", "Jalón al pecho", "Remo con barra", "Press militar", "Elevaciones laterales", "Curl con barra", "Curl martillo"]],
  ["Isquiotibiales y gemelos", [3], ["Peso muerto rumano", "Curl femoral", "Peso muerto", "Elevación de talones de pie", "Elevación de talones sentado"]],
  ["Pecho, hombro y tríceps", [4], ["Press banca", "Press inclinado mancuernas", "Aperturas", "Press militar", "Elevaciones laterales", "Fondos", "Extensión en polea"]],
  ["Cuádriceps, isquios y gemelos", [5], ["Sentadilla", "Extensión de cuádriceps", "Peso muerto rumano", "Curl femoral", "Elevación de talones de pie"]]
];

// v3: grupos de pierna separados + rutinas por día de la semana
function migrarV3() {
  const grupo = { "Sentadilla": "Cuádriceps", "Prensa": "Cuádriceps", "Extensión de cuádriceps": "Cuádriceps", "Curl femoral": "Isquiotibiales", "Peso muerto": "Isquiotibiales" };
  S.ejercicios.forEach(e => { if (e.grupo === "Piernas") e.grupo = grupo[e.nombre] || "Cuádriceps"; });
  [["Zancadas", "Cuádriceps"], ["Peso muerto rumano", "Isquiotibiales"], ["Elevación de talones de pie", "Gemelos"], ["Elevación de talones sentado", "Gemelos"]]
    .forEach(([nombre, g]) => { if (!S.ejercicios.some(e => e.nombre === nombre)) S.ejercicios.push({ id: uid(), nombre, grupo: g }); });
  // Quitar rutinas de ejemplo que nunca se usaron
  const ejemplos = EJEMPLOS.map(e => e[0]);
  S.rutinas = S.rutinas.filter(r => !ejemplos.includes(r.nombre) || S.sesiones.some(s => s.nombre === r.nombre));
  const id = n => S.ejercicios.find(e => e.nombre === n)?.id;
  SEMANA.forEach(([nombre, dias, l]) => {
    if (!S.rutinas.some(r => r.nombre === nombre)) S.rutinas.push({ id: uid(), nombre, dias, ejs: l.map(id).filter(Boolean) });
  });
  S.rutinas.forEach(r => r.dias ||= []);
  S.v3 = true;
}
const SEED = [
  ["Press banca", "Pecho"], ["Press inclinado mancuernas", "Pecho"], ["Aperturas", "Pecho"],
  ["Dominadas", "Espalda"], ["Remo con barra", "Espalda"], ["Jalón al pecho", "Espalda"],
  ["Sentadilla", "Piernas"], ["Peso muerto", "Piernas"], ["Prensa", "Piernas"], ["Extensión de cuádriceps", "Piernas"], ["Curl femoral", "Piernas"],
  ["Press militar", "Hombros"], ["Elevaciones laterales", "Hombros"],
  ["Curl con barra", "Bíceps"], ["Curl martillo", "Bíceps"],
  ["Fondos", "Tríceps"], ["Extensión en polea", "Tríceps"],
  ["Plancha", "Core"], ["Abdominales", "Core"]
];

const EJEMPLOS = [
  ["Full body", ["Sentadilla", "Press banca", "Remo con barra", "Press militar", "Plancha"]],
  ["Push (empuje)", ["Press banca", "Press inclinado mancuernas", "Press militar", "Elevaciones laterales", "Extensión en polea"]],
  ["Pull (tirón)", ["Dominadas", "Remo con barra", "Jalón al pecho", "Curl con barra", "Curl martillo"]],
  ["Legs (piernas)", ["Sentadilla", "Peso muerto", "Prensa", "Curl femoral", "Extensión de cuádriceps"]]
];

let S; // estado
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const save = () => DB.set("state", S);
const $ = s => document.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ej = id => S.ejercicios.find(e => e.id === id) || { nombre: "(eliminado)", grupo: "" };
const fFecha = iso => new Date(iso).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const vol = it => it.sets.filter(s => s.ok).reduce((a, s) => a + (+s.p || 0) * (+s.r || 0), 0);

async function init() {
  await DB.open();
  S = await DB.get("state");
  if (!S) {
    S = { ejercicios: SEED.map(([nombre, grupo]) => ({ id: uid(), nombre, grupo })), rutinas: [], sesiones: [], activa: null };
    await save();
  }
  S.descEj ||= {};
  if (!S.ejemplos) {
    if (!S.rutinas.length) {
      const id = n => S.ejercicios.find(e => e.nombre === n)?.id;
      S.rutinas = EJEMPLOS.map(([nombre, l]) => ({ id: uid(), nombre, ejs: l.map(id).filter(Boolean) }));
    }
    S.ejemplos = true; await save();
  }
  if (!S.v3) { migrarV3(); await save(); }
  if (navigator.storage?.persist) navigator.storage.persist();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  document.querySelectorAll("nav button").forEach(b => b.onclick = () => ir(b.dataset.v));
  ir("entrenar");
  setInterval(tick, 1000);
}

let vista = "entrenar";
function ir(v) {
  vista = v;
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  $("#ttl").textContent = { entrenar: "Hoy", rutinas: "Rutinas", ajustes: "Ajustes", historial: "Historial", progreso: "Progreso" }[v];
  $("#hact").innerHTML = "";
  ({ entrenar: vEntrenar, rutinas: vRutinas, ajustes: vEjercicios, historial: vHistorial, progreso: vProgreso })[v]();
  window.scrollTo(0, 0);
}

function modal(html) {
  $("#mod").innerHTML = `<div class="modal" onclick="if(event.target===this)cerrar()"><div class="sheet">${html}</div></div>`;
}
function cerrar() { $("#mod").innerHTML = ""; }

// ---------- Elegir ejercicios (modal reutilizable) ----------
function elegirEjercicios(cb, multi = true) {
  let sel = new Set();
  const pintar = (q = "") => {
    const lista = S.ejercicios.filter(e => e.nombre.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));
    $("#elist").innerHTML = lista.map(e => `
      <div class="item" onclick="window._tog('${e.id}')">
        <div>${esc(e.nombre)}<br><span class="chip">${esc(e.grupo)}</span></div>
        <span style="font-size:22px">${sel.has(e.id) ? "✅" : "⬜"}</span>
      </div>`).join("") || `<div class="empty">Sin resultados</div>`;
  };
  window._tog = id => {
    if (!multi) { cerrar(); cb([id]); return; }
    sel.has(id) ? sel.delete(id) : sel.add(id); pintar($("#eq").value);
  };
  window._okSel = () => { cerrar(); cb([...sel]); };
  modal(`<div class="row sp"><h2 style="margin:0">Elegir ejercicios</h2>
    ${multi ? `<button class="btn sm" onclick="_okSel()">Agregar</button>` : ""}</div>
    <input id="eq" placeholder="Buscar..." oninput="window._pin(this.value)" style="margin-top:10px">
    <div class="list" id="elist"></div>`);
  window._pin = pintar; pintar();
}

// ---------- ENTRENAR ----------
// Íconos de línea (SVG)
const IC = {
  play: '<path d="M7 4v16l13-8z"/>', check: '<path d="M5 12l5 5L20 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>', swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>', down: '<path d="M6 9l6 6 6-6"/>', flame: '<path d="M12 12c2-2.96 0-7-1-8 0 3.04-1.77 4.74-3 6-1.23 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.53-1.06-3.94-2-5-1.79 3-2.8 3-4 2z"/>',
  gear: '<path d="M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.6 1.1 1.7 1.7 0 0 1 2.3 2.3 1.7 1.7 0 0 0 1.1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1.1 2.6 1.7 1.7 0 0 1-2.3 2.3 1.7 1.7 0 0 0-2.6 1.1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1.1 1.7 1.7 0 0 1-2.3-2.3 1.7 1.7 0 0 0-1.1-2.6 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1.1-2.6 1.7 1.7 0 0 1 2.3-2.3 1.7 1.7 0 0 0 2.6-1.1z"/><circle cx="12" cy="12" r="3"/>'
};
const ico = (n, s = "s") => `<svg class="i ${s}" viewBox="0 0 24 24">${IC[n]}</svg>`;

// Colores por grupo muscular [fondo, texto]
const COLOR = {
  Pecho: ["#3d1f2b", "#ed93b1"], Espalda: ["#173a2c", "#5dcaa5"], Hombros: ["#3a2a10", "#ef9f27"], Bíceps: ["#2a2550", "#afa9ec"],
  Tríceps: ["#3d2218", "#f0997b"], Cuádriceps: ["#13304a", "#85b7eb"], Isquiotibiales: ["#25360f", "#97c459"], Gemelos: ["#163636", "#9fe1cb"],
  Glúteos: ["#3a1530", "#e27fae"], Core: ["#30302c", "#d3d1c7"], Cardio: ["#3d1717", "#f09595"], Otro: ["#2a2a2a", "#b4b2a9"]
};
const tag = g => { const [b, c] = COLOR[g] || COLOR.Otro; return `<span class="tag" style="background:${b};color:${c}">${esc(g)}</span>`; };
const gruposDe = r => [...new Set(r.ejs.map(id => ej(id).grupo).filter(Boolean))];

// Mantener la pantalla encendida durante el entrenamiento
let wl;
async function pantalla(on) {
  try {
    if (on && !wl && "wakeLock" in navigator) { wl = await navigator.wakeLock.request("screen"); wl.onrelease = () => wl = null; }
    if (!on && wl) { wl.release(); wl = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S?.activa) pantalla(true); });

function vEntrenar() {
  const a = S.activa;
  if (!a) return vHoy();
  pantalla(true);
  const hecho = it => it.sets.length && it.sets.every(s => s.ok);
  const nHechos = a.items.filter(hecho).length;
  const cur = a.items.findIndex(it => !hecho(it));
  window._abiertos ||= new Set();
  $("#ttl").textContent = "Entrenando"; $("#hact").innerHTML = "";
  $("#app").innerHTML = `
    <div class="row sp mut"><span>${esc(a.nombre)}</span><span id="dur"></span></div>
    <div class="bar" style="margin:8px 0 4px"><div style="width:${a.items.length ? nHechos / a.items.length * 100 : 0}%"></div></div>
    <div class="mut">${nHechos} de ${a.items.length} ejercicios</div>
    ${a.items.map((it, i) => {
      if (hecho(it) && !_abiertos.has(i)) return `
        <div class="card fin row sp" onclick="_abiertos.add(${i});vEntrenar()">
          <span><span style="color:var(--ok)">${ico("check")}</span> ${esc(ej(it.ej).nombre)} · ${it.sets.length} series</span>${ico("down")}</div>`;
      const prev = previo(it.ej), sAct = it.sets.findIndex(s => !s.ok);
      return `<div class="card ${i === cur ? "cur" : ""}">
        <div class="row sp"><b style="font-size:17px">${esc(ej(it.ej).nombre)}</b>
          <span class="row" style="gap:2px"><button class="chip" style="border:0" onclick="cambiarDesc('${it.ej}')">${ico("clock")} ${descDe(it.ej)}s</button>
          <button class="ico" onclick="reemplazarEj(${i})" aria-label="Reemplazar">${ico("swap")}</button>
          <button class="ico" onclick="quitarEj(${i})">${ico("x")}</button></span></div>
        ${prev ? `<div class="mut">Anterior: ${prev}</div>` : ""}
        <div class="set mut" style="font-size:12px;margin-bottom:0"><span>#</span><span style="text-align:center">kg</span><span style="text-align:center">reps</span><span></span></div>
        ${it.sets.map((s, j) => `
          <div class="set ${s.ok ? "done" : j === sAct && i === cur ? "cur" : "pend"}">
            <span class="mut" style="text-align:center">${j + 1}</span>
            <div class="stp"><button onclick="paso(${i},${j},'p',-2.5)">−</button><input type="number" inputmode="decimal" value="${s.p}" onchange="setV(${i},${j},'p',this.value)"><button onclick="paso(${i},${j},'p',2.5)">+</button></div>
            <div class="stp"><button onclick="paso(${i},${j},'r',-1)">−</button><input type="number" inputmode="numeric" value="${s.r}" onchange="setV(${i},${j},'r',this.value)"><button onclick="paso(${i},${j},'r',1)">+</button></div>
            <button class="chk" onclick="okSet(${i},${j})">${ico("check", "")}</button>
          </div>`).join("")}
        <div class="row" style="margin-top:8px">
          <button class="btn sec sm" onclick="addSet(${i})">+ Serie</button>
          ${it.sets.length ? `<button class="btn sec sm" onclick="delSet(${i})">− Serie</button>` : ""}
          ${hecho(it) ? `<button class="btn sec sm" onclick="_abiertos.delete(${i});vEntrenar()">Plegar</button>` : ""}
        </div>
      </div>${i === cur && a.items[cur + 1] ? `<div class="mut" style="padding:0 4px">Siguiente: ${esc(ej(a.items[cur + 1].ej).nombre)}</div>` : ""}`;
    }).join("")}
    <button class="btn sec full" style="margin-top:10px" onclick="addEjActiva()">+ Agregar ejercicio</button>
    <button class="btn full" style="margin-top:10px" onclick="terminar()">Terminar entrenamiento</button>
    <button class="btn sec full" style="margin-top:10px;color:var(--bad)" onclick="descartar()">Descartar</button>
    <div style="height:70px"></div>`;
  tick();
}

function vHoy() {
  const hoy = new Date(), d = hoy.getDay(), deHoy = S.rutinas.filter(r => r.dias?.includes(d));
  $("#ttl").textContent = "Hoy";
  pantalla(false); window._abiertos = new Set();
  $("#hact").innerHTML = `<button class="ico" onclick="ir('ajustes')" aria-label="Ajustes">${ico("gear", "")}</button>`;
  // Progreso de la semana: días planificados vs. días entrenados desde el lunes
  const plan = ORDEN_DIAS.filter(x => S.rutinas.some(r => r.dias?.includes(x))).length;
  const hechos = new Set(S.sesiones.filter(s => new Date(s.fecha) >= lunes(hoy)).map(s => diaKey(s.fecha))).size;
  const durEst = r => {
    const ds = S.sesiones.filter(s => s.nombre === r.nombre).slice(0, 5).map(s => s.dur);
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : r.ejs.length * 8;
  };
  const hace = r => {
    const s = S.sesiones.find(x => x.nombre === r.nombre); if (!s) return "nunca hecha";
    const n = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(s.fecha).setHours(0, 0, 0, 0)) / 864e5);
    return n === 0 ? "hecha hoy" : n === 1 ? "última vez ayer" : `última vez hace ${n} días`;
  };
  const titulo = deHoy.length ? `Hoy toca ${deHoy[0].nombre.split(/[ ,]/)[0].toLowerCase()}` : "Hoy es día de descanso";
  $("#app").innerHTML = `
    <div class="mut">${hoy.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}</div>
    <div class="big">${esc(titulo)}</div>
    <div class="card row sp">
      <div><b style="color:var(--acc);font-size:20px">${ico("flame", "")} ${racha()}</b> <span class="mut">días de racha</span></div>
      ${plan ? `<div style="text-align:right"><div class="mut">Semana: ${Math.min(hechos, plan)} de ${plan}</div>
        <div class="wk" style="margin-top:5px;justify-content:flex-end">${Array.from({ length: plan }, (_, k) => `<b class="${k < hechos ? "on" : ""}"></b>`).join("")}</div></div>` : ""}
    </div>
    ${deHoy.map(r => `
      <div class="card cur">
        <b style="font-size:18px">${esc(r.nombre)}</b>
        <div style="margin:6px 0">${gruposDe(r).map(tag).join("")}</div>
        <div class="mut">${r.ejs.length} ejercicios · ~${durEst(r)} min · ${hace(r)}</div>
        <button class="btn full" style="margin-top:12px" onclick="empezar('${r.id}')">${ico("play")} Empezar</button>
      </div>`).join("") || `<div class="card mut">No tenés rutina para hoy. Descansá o elegí otra abajo.</div>`}
    <button class="btn sec full" onclick="empezar()">Entrenamiento libre</button>
    <h2>Otra rutina</h2>
    ${S.rutinas.filter(r => !deHoy.includes(r)).map(r => `
      <div class="card row sp" onclick="empezar('${r.id}')">
        <div><b>${esc(r.nombre)}</b><div>${gruposDe(r).map(tag).join("")}</div></div><span class="mut">${ico("play")}</span>
      </div>`).join("") || `<div class="mut">No hay otras rutinas.</div>`}
    ${ultimaSesionHtml()}`;
}

function paso(i, j, k, d) {
  const s = S.activa.items[i].sets[j];
  s[k] = String(Math.max(0, Math.round(((+s[k] || 0) + d) * 100) / 100));
  save(); vEntrenar();
}

function ultimaSesionHtml() {
  const s = S.sesiones[0];
  if (!s) return "";
  return `<h2>Último entrenamiento</h2><div class="card" onclick="verSesion('${s.id}')">
    <b>${esc(s.nombre)}</b><br><span class="mut">${fFecha(s.fecha)} · ${s.items.length} ejercicios · ${Math.round(s.items.reduce((a, i) => a + vol(i), 0)).toLocaleString("es")} kg</span></div>`;
}

function previo(ejId) {
  for (const s of S.sesiones) {
    const it = s.items.find(i => i.ej === ejId);
    if (it) { const ok = it.sets.filter(x => x.ok); if (ok.length) return ok.map(x => `${x.p}×${x.r}`).join(", "); }
  }
  return "";
}

function setsIniciales(ejId) {
  for (const s of S.sesiones) {
    const it = s.items.find(i => i.ej === ejId);
    if (it) { const ok = it.sets.filter(x => x.ok); if (ok.length) return ok.map(x => ({ p: x.p, r: x.r, ok: false })); }
  }
  return [{ p: "", r: "", ok: false }, { p: "", r: "", ok: false }, { p: "", r: "", ok: false }];
}

function empezar(rid) {
  if (S.activa && !confirm("Ya tenés un entrenamiento en curso. ¿Descartarlo y empezar otro?")) return;
  const r = S.rutinas.find(x => x.id === rid);
  S.activa = { id: uid(), nombre: r ? r.nombre : "Entrenamiento libre", inicio: Date.now(),
    items: (r ? r.ejs : []).filter(id => S.ejercicios.some(e => e.id === id)).map(id => ({ ej: id, sets: setsIniciales(id) })) };
  save(); vEntrenar();
}
function setV(i, j, k, v) { S.activa.items[i].sets[j][k] = v; save(); }
function okSet(i, j) {
  const it = S.activa.items[i], s = it.sets[j];
  s.ok = !s.ok;
  const sig = it.sets[j + 1];
  if (s.ok && sig && !sig.ok && sig.p === "" && sig.r === "") { sig.p = s.p; sig.r = s.r; }
  save(); vEntrenar();
  if (!s.ok) return;
  // Al terminar todas las series del ejercicio: descanso largo de 3 minutos
  descanso(it.ej, it.sets.every(x => x.ok) ? 180 : null);
  // Récord personal: supera el máximo histórico y el resto de las series de hoy
  const p = +s.p || 0, hist = maxHist(it.ej);
  const hoy = Math.max(0, ...it.sets.filter((x, k) => k !== j && x.ok).map(x => +x.p || 0));
  if (hist > 0 && p > hist && p > hoy) toast(`🏆 ¡Nuevo PR en ${ej(it.ej).nombre}! ${p} kg`);
}
function maxHist(ejId) {
  let m = 0;
  S.sesiones.forEach(s => s.items.forEach(i => { if (i.ej === ejId) i.sets.forEach(x => m = Math.max(m, +x.p || 0)); }));
  return m;
}
function toast(t) {
  const d = document.createElement("div"); d.className = "toast"; d.textContent = t;
  document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
}
const descDe = id => S.descEj[id] || S.descanso || 90;
function cambiarDesc(id) {
  const v = prompt(`Descanso para ${ej(id).nombre} (segundos):`, descDe(id));
  if (v === null) return;
  if (+v > 0) S.descEj[id] = Math.round(+v); else delete S.descEj[id];
  save(); vEntrenar();
}
function addSet(i) {
  const sets = S.activa.items[i].sets, u = sets[sets.length - 1];
  sets.push({ p: u ? u.p : "", r: u ? u.r : "", ok: false }); save(); vEntrenar();
}
function delSet(i) { S.activa.items[i].sets.pop(); save(); vEntrenar(); }
function quitarEj(i) { if (confirm("¿Quitar este ejercicio?")) { S.activa.items.splice(i, 1); save(); vEntrenar(); } }
function reemplazarEj(i) {
  const it = S.activa.items[i];
  elegirEjercicios(([id]) => {
    if (!id || id === it.ej) return;
    const hechas = it.sets.filter(s => s.ok);
    // Las series ya hechas quedan con el ejercicio original; el resto pasa al nuevo
    if (hechas.length) { it.sets = hechas; S.activa.items.splice(i + 1, 0, { ej: id, sets: setsIniciales(id) }); }
    else S.activa.items[i] = { ej: id, sets: setsIniciales(id) };
    save(); vEntrenar(); toast(`Reemplazado por ${ej(id).nombre}`);
  }, false);
}
function addEjActiva() {
  elegirEjercicios(ids => { ids.forEach(id => S.activa.items.push({ ej: id, sets: setsIniciales(id) })); save(); vEntrenar(); });
}
function terminar() {
  const a = S.activa;
  const items = a.items.map(it => ({ ...it, sets: it.sets.filter(s => s.ok) })).filter(it => it.sets.length);
  if (!items.length) { if (confirm("No marcaste ninguna serie. ¿Descartar?")) { S.activa = null; save(); vEntrenar(); } return; }
  const pend = a.items.reduce((n, it) => n + it.sets.filter(s => !s.ok).length, 0);
  if (!confirm(pend ? `Quedan ${pend} series sin marcar (no se guardan). ¿Terminar igual?` : "¿Terminar y guardar el entrenamiento?")) return;
  // Datos para el resumen (antes de guardar, para comparar contra lo anterior)
  const prs = items.map(it => [it.ej, Math.max(...it.sets.map(x => +x.p || 0)), maxHist(it.ej)])
    .filter(([, hoy, ant]) => ant > 0 && hoy > ant);
  const ant = S.sesiones.find(s => s.nombre === a.nombre);
  const ses = { id: a.id, nombre: a.nombre, fecha: new Date(a.inicio).toISOString(), dur: Math.round((Date.now() - a.inicio) / 60000), items };
  S.sesiones.unshift(ses);
  S.activa = null; descansoFin = 0; save(); vEntrenar();
  resumen(ses, prs, ant);
}

function resumen(s, prs, ant) {
  const v = volSes(s), nSeries = s.items.reduce((n, i) => n + i.sets.length, 0);
  let comp = "";
  if (ant) {
    const va = volSes(ant), pct = va ? Math.round((v - va) / va * 100) : 0;
    comp = `<div class="card"><div class="mut">Comparado con la última vez (${fFecha(ant.fecha)})</div>
      <div class="${pct >= 0 ? "up" : "down"}" style="font-size:18px;font-weight:700">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% de volumen</div>
      <div class="mut">${Math.round(va).toLocaleString("es")} kg → ${Math.round(v).toLocaleString("es")} kg · ${ant.dur} min → ${s.dur} min</div></div>`;
  }
  modal(`<div style="text-align:center"><div style="font-size:44px">💪</div>
      <h2 style="margin:4px 0">¡Entrenamiento terminado!</h2><div class="mut">${esc(s.nombre)}</div></div>
    <div class="stat" style="margin-top:14px">
      <div><b>${s.dur}</b><span class="mut">Minutos</span></div>
      <div><b>${nSeries}</b><span class="mut">Series</span></div>
      <div><b>${(v / 1000).toFixed(1)}t</b><span class="mut">Volumen</span></div>
    </div>
    ${prs.length ? `<h2>🏆 Récords nuevos</h2><div class="card list">${prs.map(([id, hoy, a]) =>
      `<div class="item"><span>${esc(ej(id).nombre)}</span><span><span class="mut">${a} →</span> <b style="color:var(--ok)">${hoy} kg</b></span></div>`).join("")}</div>` : ""}
    ${comp}
    <button class="btn full" style="margin-top:12px" onclick="cerrar()">Listo</button>`);
}
function descartar() { if (confirm("¿Descartar el entrenamiento en curso?")) { S.activa = null; descansoFin = 0; save(); vEntrenar(); } }

// Temporizador de descanso
let descansoFin = 0, pausaRest = 0, audio, silbato;
function descanso(ejId, seg) {
  // Se activa el audio en el toque del ✓ (iPhone solo permite sonido tras un gesto del usuario)
  try {
    // "ambient": el silbato suena por encima de la música sin pausarla (Safari 17+)
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
    audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    if (!silbato) fetch("silbato.mp3").then(r => r.arrayBuffer()).then(b => audio.decodeAudioData(b)).then(buf => silbato = buf).catch(() => {});
  } catch {}
  pausaRest = 0; descansoFin = Date.now() + (seg || descDe(ejId)) * 1000; tick();
}
function ajustar(ms) {
  if (pausaRest) { pausaRest = Math.max(1000, pausaRest + ms); return tick(); }
  // Restar más de lo que queda termina el descanso en silencio (el sonido es solo para el final natural)
  if (descansoFin + ms <= Date.now()) return saltar();
  descansoFin += ms; tick();
}
function pausar() {
  if (pausaRest) { descansoFin = Date.now() + pausaRest; pausaRest = 0; }
  else { pausaRest = descansoFin - Date.now(); }
  tick();
}
function saltar() { descansoFin = 0; pausaRest = 0; tick(); }
function beep() {
  navigator.vibrate?.([300, 150, 300]);
  if (!audio) return;
  if (silbato) {
    const src = audio.createBufferSource(); src.buffer = silbato;
    src.connect(audio.destination); src.start(); return;
  }
  [0, 0.35, 0.7].forEach(t => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.25;
    o.connect(g); g.connect(audio.destination);
    o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
  });
}
function tick() {
  if (S?.activa && $("#dur")) { const m = Math.floor((Date.now() - S.activa.inicio) / 60000); $("#dur").textContent = `${m} min`; }
  const rest = Math.ceil((pausaRest || descansoFin - Date.now()) / 1000);
  if (descansoFin && rest <= 0 && !pausaRest) {
    // Si terminó hace rato (app en segundo plano), no suena tarde
    if (Date.now() - descansoFin < 3000) { beep(); toast("⏱ ¡Descanso terminado! A la próxima serie"); }
    descansoFin = 0;
  }
  if (descansoFin && rest > 0 && vista === "entrenar") {
    $("#tmr").innerHTML = `<div class="timer"><span>${pausaRest ? "⏸" : "⏱"} ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}</span>
      <span><button class="btn sec sm" onclick="ajustar(-15000)">−15</button> <button class="btn sec sm" onclick="ajustar(15000)">+15</button>
      <button class="btn sec sm" onclick="pausar()">${pausaRest ? "▶" : "⏸"}</button> <button class="btn sec sm" onclick="saltar()">Saltar</button></span></div>`;
  } else $("#tmr").innerHTML = "";
}

// ---------- RUTINAS ----------
function vRutinas() {
  $("#hact").innerHTML = `<button class="btn sm" onclick="editRutina()">+ Nueva</button>`;
  const semana = ORDEN_DIAS.map(d => {
    const rs = S.rutinas.filter(r => r.dias?.includes(d)), hoy = d === new Date().getDay();
    return `<div class="item" ${hoy ? 'style="color:var(--acc)"' : ""}><b>${DIAS[d]}</b>
      <span class="${rs.length ? "" : "mut"}" style="text-align:right">${rs.map(r => esc(r.nombre)).join("<br>") || "Descanso"}</span></div>`;
  }).join("");
  $("#app").innerHTML = `<h2 style="margin-top:4px">Mi semana</h2><div class="card list">${semana}</div>
    <div class="mut" style="font-size:12px">Para asignar un día, editá la rutina (✎).</div><h2>Rutinas</h2>`
    + (S.rutinas.length ? S.rutinas.map(r => {
    const ult = S.sesiones.find(s => s.nombre === r.nombre);
    return `<div class="card">
      <div onclick="editRutina('${r.id}')"><b>${esc(r.nombre)}</b> <span class="mut">✎</span><br>
      <span class="mut">${r.ejs.length} ejercicios · ${ult ? "última vez " + fFecha(ult.fecha) : "nunca hecha"}</span><br>
      <span class="mut" style="font-size:13px">${r.ejs.map(id => esc(ej(id).nombre)).join(" · ")}</span></div>
      <button class="btn sm" style="margin-top:10px" onclick="empezar('${r.id}');ir('entrenar')">▶ Empezar</button>
    </div>`;
  }).join("") : `<div class="empty">Creá tu primera rutina, por ejemplo "Día de pecho" o "Piernas".</div>`);
}
function editRutina(id) {
  const r = id ? structuredClone(S.rutinas.find(x => x.id === id)) : { id: uid(), nombre: "", ejs: [], dias: [] };
  r.dias ||= [];
  window._r = r;
  const pintar = () => modal(`
    <h2 style="margin-top:0">${id ? "Editar" : "Nueva"} rutina</h2>
    <label>Nombre</label><input id="rn" value="${esc(r.nombre)}" oninput="_r.nombre=this.value" placeholder="Ej: Día de pecho">
    <label>Días de la semana</label>
    <div class="seg">${ORDEN_DIAS.map(d => `<button class="${r.dias.includes(d) ? "on" : ""}" onclick="_dia(${d})">${DIAS[d].slice(0, 2)}</button>`).join("")}</div>
    <label>Ejercicios</label>
    <div class="list" id="rl">${r.ejs.map((e, i) => `
      <div class="item" data-i="${i}"><span class="row"><span class="drag" onpointerdown="_drag(event)">☰</span>${esc(ej(e).nombre)}</span>
        <button class="ico" onclick="_rm(${i})">✕</button>
      </div>`).join("") || `<div class="mut">Sin ejercicios</div>`}</div>
    ${r.ejs.length > 1 ? `<div class="mut" style="font-size:12px">Arrastrá ☰ para ordenar</div>` : ""}
    <button class="btn sec full" style="margin-top:10px" onclick="_add()">+ Agregar ejercicios</button>
    <button class="btn full" style="margin-top:10px" onclick="_saveR()">Guardar</button>
    ${id ? `<button class="btn bad full" style="margin-top:10px" onclick="_delR()">Eliminar rutina</button>` : ""}`);
  // Arrastrar: se mueven los nodos del DOM y al soltar se reordena r.ejs
  window._drag = ev => {
    ev.preventDefault();
    const fila = ev.target.closest(".item"), lista = $("#rl");
    fila.classList.add("mov");
    const mover = e => {
      const otra = [...lista.children].find(c => c !== fila && (() => {
        const b = c.getBoundingClientRect(); return e.clientY > b.top && e.clientY < b.bottom;
      })());
      if (!otra) return;
      const b = otra.getBoundingClientRect();
      lista.insertBefore(fila, e.clientY < b.top + b.height / 2 ? otra : otra.nextSibling);
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar);
      const orden = [...lista.children].map(c => r.ejs[+c.dataset.i]);
      r.ejs = orden; pintar();
    };
    document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar);
  };
  window._dia = d => { r.dias = r.dias.includes(d) ? r.dias.filter(x => x !== d) : [...r.dias, d]; pintar(); };
  window._rm = i => { r.ejs.splice(i, 1); pintar(); };
  window._add = () => elegirEjercicios(ids => { r.ejs.push(...ids); pintar(); });
  window._saveR = () => {
    if (!r.nombre.trim()) return alert("Poné un nombre a la rutina");
    const k = S.rutinas.findIndex(x => x.id === r.id);
    k >= 0 ? S.rutinas[k] = r : S.rutinas.push(r);
    save(); cerrar(); vRutinas();
  };
  window._delR = () => { if (confirm("¿Eliminar la rutina?")) { S.rutinas = S.rutinas.filter(x => x.id !== r.id); save(); cerrar(); vRutinas(); } };
  pintar();
}

// ---------- EJERCICIOS ----------
function vEjercicios() {
  $("#hact").innerHTML = `<button class="btn sm" onclick="editEj()">+ Nuevo</button>`;
  const porGrupo = GRUPOS.map(g => [g, S.ejercicios.filter(e => e.grupo === g).sort((a, b) => a.nombre.localeCompare(b.nombre))]).filter(([, l]) => l.length);
  $("#app").innerHTML = porGrupo.map(([g, l]) => `
    <h2>${g}</h2><div class="card list">${l.map(e => `
      <div class="item" onclick="editEj('${e.id}')"><span>${esc(e.nombre)}</span><span class="mut">›</span></div>`).join("")}</div>`).join("")
    + `<h2>Datos</h2><div class="card">
      <p class="mut" style="margin-top:0">Hacé una copia de seguridad cada tanto. Si se borra Safari o cambiás de iPhone, la restaurás con "Importar".</p>
      <label>Descanso entre series (segundos)</label>
      <input type="number" inputmode="numeric" value="${S.descanso || 90}" onchange="S.descanso=+this.value||90;save()">
      <div class="row" style="margin-top:12px"><button class="btn sec" style="flex:1" onclick="exportar()">⬇ Exportar</button>
      <button class="btn sec" style="flex:1" onclick="$('#imp').click()">⬆ Importar</button></div>
      <input type="file" id="imp" accept=".json,application/json" style="display:none" onchange="importar(this.files[0])">
    </div>`;
}
function editEj(id) {
  const e = id ? S.ejercicios.find(x => x.id === id) : { nombre: "", grupo: "Pecho" };
  modal(`<h2 style="margin-top:0">${id ? "Editar" : "Nuevo"} ejercicio</h2>
    <label>Nombre</label><input id="en" value="${esc(e.nombre)}">
    <label>Grupo muscular</label><select id="eg">${GRUPOS.map(g => `<option ${g === e.grupo ? "selected" : ""}>${g}</option>`).join("")}</select>
    <button class="btn full" style="margin-top:14px" onclick="_saveE()">Guardar</button>
    ${id ? `<button class="btn bad full" style="margin-top:10px" onclick="_delE()">Eliminar</button>` : ""}`);
  window._saveE = () => {
    const nombre = $("#en").value.trim(); if (!nombre) return alert("Poné un nombre");
    if (id) Object.assign(e, { nombre, grupo: $("#eg").value });
    else S.ejercicios.push({ id: uid(), nombre, grupo: $("#eg").value });
    save(); cerrar(); vEjercicios();
  };
  window._delE = () => {
    if (!confirm("¿Eliminar el ejercicio? Se quita de las rutinas (el historial se conserva).")) return;
    S.ejercicios = S.ejercicios.filter(x => x.id !== id);
    S.rutinas.forEach(r => r.ejs = r.ejs.filter(x => x !== id));
    save(); cerrar(); vEjercicios();
  };
}

// ---------- HISTORIAL ----------
function vHistorial() {
  $("#app").innerHTML = S.sesiones.length ? S.sesiones.map(s => `
    <div class="card" onclick="verSesion('${s.id}')">
      <div class="row sp"><b>${esc(s.nombre)}</b><span class="mut">${fFecha(s.fecha)}</span></div>
      <span class="mut">${s.dur} min · ${s.items.length} ejercicios · ${Math.round(s.items.reduce((a, i) => a + vol(i), 0)).toLocaleString("es")} kg</span>
    </div>`).join("") : `<div class="empty">Todavía no hay entrenamientos guardados.</div>`;
}
function verSesion(id) {
  const s = S.sesiones.find(x => x.id === id);
  modal(`<h2 style="margin-top:0">${esc(s.nombre)}</h2>
    <div class="mut">${new Date(s.fecha).toLocaleString("es")} · ${s.dur} min</div>
    ${s.items.map(it => `<div class="card"><b>${esc(ej(it.ej).nombre)}</b><br>
      <span class="mut">${it.sets.map(x => `${x.p} kg × ${x.r}`).join("<br>")}</span></div>`).join("")}
    <button class="btn sec full" onclick="editSesion('${id}')">Editar</button>
    <button class="btn bad full" style="margin-top:10px" onclick="_delS()">Eliminar entrenamiento</button>`);
  window._delS = () => { if (confirm("¿Eliminar este entrenamiento?")) { S.sesiones = S.sesiones.filter(x => x.id !== id); save(); cerrar(); ir(vista); } };
}

// Editar un entrenamiento guardado (sobre una copia; se aplica al tocar Guardar)
function editSesion(id) {
  const orig = S.sesiones.find(x => x.id === id), s = structuredClone(orig);
  const pintar = () => modal(`<h2 style="margin-top:0">Editar entrenamiento</h2>
    <div class="mut">${esc(s.nombre)} · ${fFecha(s.fecha)}</div>
    <label>Duración (min)</label><input type="number" inputmode="numeric" value="${s.dur}" onchange="_es.dur=+this.value||0">
    ${s.items.map((it, i) => `<div class="card">
      <div class="row sp"><b>${esc(ej(it.ej).nombre)}</b><button class="ico" onclick="_esDelEj(${i})">${ico("x")}</button></div>
      <div class="set mut" style="font-size:12px;grid-template-columns:22px 1fr 1fr 40px"><span>#</span><span style="text-align:center">kg</span><span style="text-align:center">reps</span><span></span></div>
      ${it.sets.map((x, j) => `<div class="set" style="grid-template-columns:22px 1fr 1fr 40px">
        <span class="mut">${j + 1}</span>
        <input type="number" inputmode="decimal" value="${x.p}" onchange="_es.items[${i}].sets[${j}].p=this.value">
        <input type="number" inputmode="numeric" value="${x.r}" onchange="_es.items[${i}].sets[${j}].r=this.value">
        <button class="ico" onclick="_esDelSet(${i},${j})">${ico("x")}</button></div>`).join("")}
      <button class="btn sec sm" style="margin-top:6px" onclick="_esAddSet(${i})">+ Serie</button>
    </div>`).join("")}
    <button class="btn full" onclick="_esSave()">Guardar cambios</button>
    <button class="btn sec full" style="margin-top:10px" onclick="verSesion('${id}')">Cancelar</button>`);
  window._es = s;
  window._esDelSet = (i, j) => { s.items[i].sets.splice(j, 1); if (!s.items[i].sets.length) s.items.splice(i, 1); pintar(); };
  window._esDelEj = i => { if (confirm("¿Quitar este ejercicio del entrenamiento?")) { s.items.splice(i, 1); pintar(); } };
  window._esAddSet = i => { const u = s.items[i].sets.at(-1); s.items[i].sets.push({ p: u?.p ?? "", r: u?.r ?? "", ok: true }); pintar(); };
  window._esSave = () => {
    if (!s.items.length) return alert("El entrenamiento quedó vacío. Si querés borrarlo, usá Eliminar.");
    Object.assign(orig, s); save(); toast("Cambios guardados"); verSesion(id); ir(vista);
  };
  pintar();
}

// ---------- PROGRESO ----------
const diaKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const volSes = s => s.items.reduce((a, i) => a + vol(i), 0);

function racha() {
  const dias = new Set(S.sesiones.map(s => diaKey(s.fecha)));
  const d = new Date(); let n = 0;
  if (!dias.has(diaKey(d))) d.setDate(d.getDate() - 1); // hoy todavía no cuenta en contra
  while (dias.has(diaKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function vProgreso() {
  const hoy = new Date(), l = lunes(hoy), lAnt = new Date(l - 7 * 864e5);
  const volAct = S.sesiones.filter(s => new Date(s.fecha) >= l).reduce((a, s) => a + volSes(s), 0);
  const volAnt = S.sesiones.filter(s => { const f = new Date(s.fecha); return f >= lAnt && f < l; }).reduce((a, s) => a + volSes(s), 0);
  const pct = volAnt ? Math.round((volAct - volAnt) / volAnt * 100) : null;
  const diasMes = new Set(S.sesiones.filter(s => { const f = new Date(s.fecha); return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear(); }).map(s => diaKey(s.fecha)));
  const usados = [...new Set(S.sesiones.flatMap(s => s.items.map(i => i.ej)))];
  window._pej = window._pej && usados.includes(window._pej) ? window._pej : usados[0];
  window._rng ||= "sem";

  // Calendario del mes
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1), ndias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const cal = ["L", "M", "M", "J", "V", "S", "D"].map(d => `<span class="mut">${d}</span>`).join("")
    + "<span></span>".repeat((primero.getDay() + 6) % 7)
    + Array.from({ length: ndias }, (_, i) => {
      const k = `${hoy.getFullYear()}-${hoy.getMonth()}-${i + 1}`;
      return `<span class="${diasMes.has(k) ? "on" : ""} ${i + 1 === hoy.getDate() ? "hoy" : ""}">${i + 1}</span>`;
    }).join("");

  const prs = usados.map(id => [id, maxHist(id)]).filter(([, m]) => m > 0).sort((a, b) => ej(a[0]).nombre.localeCompare(ej(b[0]).nombre));

  $("#app").innerHTML = `
    <div class="stat">
      <div><b>🔥 ${racha()}</b><span class="mut">Racha días</span></div>
      <div><b>${diasMes.size}</b><span class="mut">Días este mes</span></div>
      <div><b>${(volAct / 1000).toFixed(1)}t</b><span class="mut">Vol. semana</span>
        ${pct === null ? "" : `<div class="${pct >= 0 ? "up" : "down"}" style="font-size:12px">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs ant.</div>`}</div>
    </div>
    <h2>${hoy.toLocaleDateString("es", { month: "long", year: "numeric" })}</h2>
    <div class="card cal">${cal}</div>
    <h2>Progresión de peso</h2>
    ${usados.length ? `<select onchange="_pej=this.value;vProgreso()">${usados.map(id => `<option value="${id}" ${id === _pej ? "selected" : ""}>${esc(ej(id).nombre)}</option>`).join("")}</select>
    <div class="seg">${[["sem", "Semanas"], ["mes", "Mes"], ["3m", "3 meses"], ["todo", "Todo"]].map(([k, t]) =>
      `<button class="${_rng === k ? "on" : ""}" onclick="_rng='${k}';vProgreso()">${t}</button>`).join("")}</div>
    <div class="card" id="graf"></div>
    <h2>🏆 Récords personales</h2>
    <div class="card list">${prs.map(([id, m]) => `<div class="item"><span>${esc(ej(id).nombre)}</span><b>${m} kg</b></div>`).join("")}</div>`
    : `<div class="empty">Registrá entrenamientos para ver tu progreso.</div>`}`;
  if (usados.length) grafico(_pej);
}
function grafico(ejId) {
  const desde = { sem: 56, mes: 30, "3m": 91, todo: 1e5 }[_rng];
  const lim = Date.now() - desde * 864e5;
  let pts = S.sesiones.slice().reverse().filter(s => new Date(s.fecha) >= lim).map(s => {
    const it = s.items.find(i => i.ej === ejId); if (!it) return null;
    return { f: s.fecha, max: Math.max(...it.sets.map(x => +x.p || 0)) };
  }).filter(Boolean);
  if (_rng === "sem" || _rng === "todo") { // agrupar por semana (máximo de la semana)
    const m = new Map();
    pts.forEach(p => { const k = lunes(p.f).toISOString(); m.set(k, Math.max(m.get(k) || 0, p.max)); });
    pts = [...m].map(([f, max]) => ({ f, max }));
  }
  if (!pts.length) { $("#graf").innerHTML = `<div class="mut">Sin datos en este período.</div>`; return; }
  pts = pts.slice(-16);
  const best = maxHist(ejId), ult = pts[pts.length - 1];
  const W = 320, H = 150, P = 24, mx = Math.max(best, 1);
  const x = i => P + (pts.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (pts.length - 1));
  const y = v => H - P - v / mx * (H - 2 * P);
  $("#graf").innerHTML = `
    <div class="stat" style="margin-bottom:10px">
      <div><b>${best}</b><span class="mut">Récord kg</span></div>
      <div><b>${ult.max}</b><span class="mut">Último kg</span></div>
      <div><b>${pts.length}</b><span class="mut">${_rng === "sem" || _rng === "todo" ? "Semanas" : "Sesiones"}</span></div>
    </div>
    <div class="mut">Peso máximo por ${_rng === "sem" || _rng === "todo" ? "semana" : "sesión"}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%">
      <polyline fill="none" stroke="#f4b44c" stroke-width="2.5" points="${pts.map((p, i) => `${x(i)},${y(p.max)}`).join(" ")}"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.max)}" r="4" fill="#f4b44c"/><text x="${x(i)}" y="${y(p.max) - 8}" text-anchor="middle">${p.max}</text>
        <text x="${x(i)}" y="${H - 6}" text-anchor="middle">${new Date(p.f).getDate()}/${new Date(p.f).getMonth() + 1}</text>`).join("")}
    </svg>`;
}

// ---------- BACKUP ----------
function exportar() {
  const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gymlog_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
function importar(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.ejercicios) || !Array.isArray(d.sesiones)) throw 0;
      if (!confirm("Esto reemplaza todos los datos actuales. ¿Continuar?")) return;
      S = d; S.rutinas ||= []; S.descEj ||= {}; S.ejemplos = true; if (!S.v3) migrarV3(); save(); alert("Datos importados ✅"); ir("entrenar");
    } catch { alert("El archivo no es una copia válida."); }
  };
  r.readAsText(f);
}

init();
