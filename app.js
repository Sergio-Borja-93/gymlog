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
  $("#ttl").textContent = { entrenar: "Entrenar", rutinas: "Rutinas", ejercicios: "Ejercicios", historial: "Historial", progreso: "Progreso" }[v];
  $("#hact").innerHTML = "";
  ({ entrenar: vEntrenar, rutinas: vRutinas, ejercicios: vEjercicios, historial: vHistorial, progreso: vProgreso })[v]();
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
function vEntrenar() {
  const a = S.activa;
  if (!a) {
    const d = new Date().getDay(), deHoy = S.rutinas.filter(r => r.dias?.includes(d));
    $("#app").innerHTML = `
      <h2 style="margin-top:4px">Hoy · ${DIAS[d]}</h2>
      ${deHoy.length ? deHoy.map(r => `
        <div class="card" style="border:1px solid var(--acc)">
          <b style="font-size:18px">${esc(r.nombre)}</b><br>
          <span class="mut">${r.ejs.map(id => esc(ej(id).nombre)).join(" · ")}</span>
          <button class="btn full" style="margin-top:12px" onclick="empezar('${r.id}')">▶ Empezar</button>
        </div>`).join("") : `<div class="card mut">Hoy no tenés rutina asignada. ¡Día de descanso! 😴</div>`}
      <button class="btn sec full" onclick="empezar()">Entrenamiento libre</button>
      <h2>Otra rutina</h2>
      ${S.rutinas.length ? S.rutinas.map(r => `
        <div class="card row sp" onclick="empezar('${r.id}')">
          <div><b>${esc(r.nombre)}</b><br><span class="mut">${r.ejs.length} ejercicios</span></div><span>▶</span>
        </div>`).join("") : `<div class="empty">Todavía no creaste rutinas.<br>Andá a la pestaña Rutinas.</div>`}
      ${ultimaSesionHtml()}`;
    return;
  }
  $("#hact").innerHTML = `<button class="btn sm" onclick="terminar()">Terminar</button>`;
  $("#app").innerHTML = `
    <div class="mut" style="margin-bottom:6px">${esc(a.nombre)} · <span id="dur"></span>
      · ${a.items.filter(it => it.sets.length && it.sets.every(s => s.ok)).length} de ${a.items.length} ejercicios</div>
    ${a.items.map((it, i) => {
      const prev = previo(it.ej);
      return `<div class="card">
        <div class="row sp"><b>${esc(ej(it.ej).nombre)}</b>
          <span><button class="chip" style="border:0" onclick="cambiarDesc('${it.ej}')">⏱ ${descDe(it.ej)}s</button><button class="ico" onclick="quitarEj(${i})">✕</button></span></div>
        ${prev ? `<div class="mut">Anterior: ${prev}</div>` : ""}
        <div class="set mut" style="font-size:12px"><span>#</span><span style="text-align:center">kg</span><span style="text-align:center">reps</span><span></span></div>
        ${it.sets.map((s, j) => `
          <div class="set ${s.ok ? "done" : ""}">
            <span class="mut">${j + 1}</span>
            <input type="number" inputmode="decimal" value="${s.p}" onchange="setV(${i},${j},'p',this.value)">
            <input type="number" inputmode="numeric" value="${s.r}" onchange="setV(${i},${j},'r',this.value)">
            <button class="chk" onclick="okSet(${i},${j})">✓</button>
          </div>`).join("")}
        <div class="row" style="margin-top:8px">
          <button class="btn sec sm" onclick="addSet(${i})">+ Serie</button>
          ${it.sets.length ? `<button class="btn sec sm" onclick="delSet(${i})">− Serie</button>` : ""}
        </div>
      </div>`;
    }).join("")}
    <button class="btn sec full" onclick="addEjActiva()">+ Agregar ejercicio</button>
    <button class="btn bad full" style="margin-top:10px" onclick="descartar()">Descartar entrenamiento</button>`;
  tick();
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
  s.ok = !s.ok; save(); vEntrenar();
  if (!s.ok) return;
  descanso(it.ej);
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
function addEjActiva() {
  elegirEjercicios(ids => { ids.forEach(id => S.activa.items.push({ ej: id, sets: setsIniciales(id) })); save(); vEntrenar(); });
}
function terminar() {
  const a = S.activa;
  a.items = a.items.map(it => ({ ...it, sets: it.sets.filter(s => s.ok) })).filter(it => it.sets.length);
  if (!a.items.length) { if (confirm("No marcaste ninguna serie. ¿Descartar?")) { S.activa = null; save(); vEntrenar(); } return; }
  S.sesiones.unshift({ id: a.id, nombre: a.nombre, fecha: new Date(a.inicio).toISOString(), dur: Math.round((Date.now() - a.inicio) / 60000), items: a.items });
  S.activa = null; descansoFin = 0; save(); vEntrenar();
  alert("¡Entrenamiento guardado! 💪");
}
function descartar() { if (confirm("¿Descartar el entrenamiento en curso?")) { S.activa = null; descansoFin = 0; save(); vEntrenar(); } }

// Temporizador de descanso
let descansoFin = 0, pausaRest = 0, audio;
function descanso(ejId) {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
  pausaRest = 0; descansoFin = Date.now() + descDe(ejId) * 1000; tick();
}
function ajustar(ms) { if (pausaRest) pausaRest = Math.max(1000, pausaRest + ms); else descansoFin += ms; tick(); }
function pausar() {
  if (pausaRest) { descansoFin = Date.now() + pausaRest; pausaRest = 0; }
  else { pausaRest = descansoFin - Date.now(); }
  tick();
}
function saltar() { descansoFin = 0; pausaRest = 0; tick(); }
function beep() {
  navigator.vibrate?.([300, 150, 300]);
  if (!audio) return;
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
  if (descansoFin && rest <= 0 && !pausaRest) { descansoFin = 0; beep(); toast("⏱ ¡Descanso terminado! A la próxima serie"); }
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
    <button class="btn bad full" onclick="_delS()">Eliminar entrenamiento</button>`);
  window._delS = () => { if (confirm("¿Eliminar este entrenamiento?")) { S.sesiones = S.sesiones.filter(x => x.id !== id); save(); cerrar(); ir(vista); } };
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
