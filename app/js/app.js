// Pantallas de la app.
import { abrirAlmacenNavegador } from './almacen.js';
import { crearDatos, TIPOS_EVENTO, NOMBRE_TIPO, ICONO_TIPO, TIPOS_CON_AVISO, TIPOS_CLASE, NOMBRE_CLASE, ICONO_CLASE, DIAS_SEMANA } from './datos.js';
import { conversar, extraerContenido, organizarInformacion, probarClave, ErrorIA } from './ia.js';
import { crearICS, enlaceGoogle, enlaceGoogleRecordatorio } from './calendario.js';
import { ahora, hoy, bonito, diasHasta, tieneHora, sumarDias, aDate } from './fechas.js';

const almacen = await abrirAlmacenNavegador();
const datos = crearDatos(almacen);
const E = () => almacen.estado;

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const contenido = $('#contenido');

// ---------- utilidades ----------

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Convierte el texto de la IA (**negrita**, _cursiva_, listas) en HTML seguro. */
function formatear(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,:;!?]|$)/gm, '$1<b>$2</b>')
    .replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,:;!?]|$)/gm, '$1<i>$2</i>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

function aviso(texto, ms = 3500) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.hidden = true), ms);
}

function fechaCorta(t) {
  const b = bonito(t);
  return b.replace(/ de \d{4}/, '');
}

function cuandoRelativo(t) {
  const d = diasHasta(t);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

// ---------- hoja inferior (ventanas) ----------

function abrirHoja(html, alMontar) {
  const hoja = $('#hoja');
  hoja.innerHTML = html;
  hoja.hidden = false;
  $('#hoja-fondo').hidden = false;
  hoja.scrollTop = 0;
  alMontar?.(hoja);
}
function cerrarHoja() {
  $('#hoja').hidden = true;
  $('#hoja-fondo').hidden = true;
  $('#hoja').innerHTML = '';
}
$('#hoja-fondo').addEventListener('click', cerrarHoja);

function confirmar(pregunta) {
  return window.confirm(pregunta);
}

// ---------- archivos ----------

const aBase64 = (buffer) => {
  let bin = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Reduce las fotos para que pesen poco (la IA las lee igual de bien). */
async function reducirImagen(file, max = 1800) {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85));
    return { mimeType: 'image/jpeg', data: aBase64(await blob.arrayBuffer()) };
  } catch {
    return { mimeType: file.type || 'image/jpeg', data: aBase64(await file.arrayBuffer()) };
  }
}

const MAX_ARCHIVO = 15 * 1024 * 1024;

/** Lee un archivo elegido por el usuario. Devuelve {nombre, mimeType, data} o {nombre, texto}. */
async function leerArchivo(file) {
  if (file.size > MAX_ARCHIVO) throw new Error(`"${file.name}" pesa demasiado (máx. 15 MB).`);
  const tipo = file.type || '';
  const nombre = file.name || 'archivo';
  if (tipo.startsWith('image/')) return { nombre, ...(await reducirImagen(file)) };
  if (tipo === 'application/pdf' || /\.pdf$/i.test(nombre)) return { nombre, mimeType: 'application/pdf', data: aBase64(await file.arrayBuffer()) };
  if (tipo.startsWith('text/') || /\.(txt|md|csv|json|ics|html?)$/i.test(nombre)) return { nombre, texto: (await file.text()).slice(0, 200000) };
  if (tipo.startsWith('audio/')) return { nombre, mimeType: tipo, data: aBase64(await file.arrayBuffer()) };
  throw new Error(`No sé leer "${nombre}". Usa PDF, imagen o texto. (Si es un Word, guárdalo como PDF.)`);
}

/**
 * Abre el selector de archivos / cámara del móvil.
 * El campo se añade a la página (oculto) mientras se elige: en Android, si no está en la página,
 * a veces el navegador lo descarta mientras estás en la galería y el archivo elegido se pierde.
 */
function elegirArchivo(accept, capture) {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    document.body.append(input);
    const terminar = (archivo) => {
      input.remove();
      ok(archivo);
    };
    input.addEventListener('change', () => terminar(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => terminar(null), { once: true });
    input.click();
  });
}

// ---------- calendario del móvil ----------

async function compartirICS(nombre, ics) {
  const file = new File([ics], nombre, { type: 'text/calendar' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nombre });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function hojaCalendario({ eventos = [], recordatorios = [], titulo }) {
  const uno = eventos.length + recordatorios.length === 1;
  const google = uno ? (eventos[0] ? enlaceGoogle(eventos[0]) : enlaceGoogleRecordatorio(recordatorios[0])) : null;
  abrirHoja(
    `<h2>📅 Añadir al calendario</h2>
     <p class="suave pequeno">${esc(titulo)}</p>
     <button class="boton ancho" id="cal-ics">🍎 Calendario del móvil (archivo .ics)</button>
     <p class="suave pequeno">En iPhone se abre el Calendario y pulsas <b>Añadir</b>${uno ? '' : ' / <b>Añadir todos</b>'}. Incluye las alarmas de aviso.</p>
     ${google ? `<a class="boton secundario ancho" href="${esc(google)}" target="_blank" rel="noopener">🟦 Google Calendar</a>
     <p class="suave pequeno">Abre Google Calendar con el evento ya rellenado; solo tienes que pulsar Guardar.</p>` : `<p class="suave pequeno">En Android con Google Calendar, abre cada evento desde la Agenda y usa el botón de Google Calendar.</p>`}
     <button class="boton secundario ancho" id="cal-cerrar" style="margin-top:8px">Cerrar</button>`,
    (h) => {
      $('#cal-ics', h).onclick = () => compartirICS(`${titulo.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40) || 'asistente'}.ics`, crearICS({ eventos, recordatorios, ajustes: E().ajustes }));
      $('#cal-cerrar', h).onclick = cerrarHoja;
    },
  );
}

// ---------- navegación ----------

const VISTAS = { hoy: vistaHoy, horario: vistaHorario, chat: vistaChat, agenda: vistaAgenda, mas: vistaMas, notas: vistaNotas, anadir: vistaAnadir, ajustes: vistaAjustes };
const TITULOS = { hoy: 'Hoy', horario: 'Horario', chat: 'Chat', agenda: 'Agenda', mas: 'Más', notas: 'Notas', anadir: 'Añadir información', ajustes: 'Ajustes' };
const PESTANA_DE = { notas: 'mas', anadir: 'mas', ajustes: 'mas' }; // subpáginas de la pestaña Más
let vistaActual = 'hoy';

function render() {
  const nombre = (location.hash.slice(1) || 'hoy').split('/')[0];
  vistaActual = VISTAS[nombre] ? nombre : 'hoy';
  const padre = PESTANA_DE[vistaActual];
  $('#titulo').innerHTML = `${padre ? '<a class="volver" href="#mas">‹ Más</a><br>' : ''}${esc(TITULOS[vistaActual])}`;
  document.body.classList.toggle('en-chat', vistaActual === 'chat');
  for (const a of $$('.pestanas a')) a.classList.toggle('activa', a.dataset.pestana === (padre || vistaActual));
  VISTAS[vistaActual]();
  actualizarGlobo();
}
window.addEventListener('hashchange', () => {
  cerrarHoja();
  render();
  window.scrollTo(0, 0);
});

function actualizarGlobo() {
  const n = datos.verRecordatorios({ solo_vencidos: true }).length;
  const g = $('#globo-hoy');
  g.hidden = n === 0;
  g.textContent = n;
}

// =====================================================================
// HOY
// =====================================================================

function lineaEvento(ev, conDias = false) {
  const hora = tieneHora(ev.inicio) ? `${ev.inicio.slice(11)} · ` : '';
  return `<li class="elemento tocable" data-evento="${ev.id}">
    <span class="icono-ev">${ICONO_TIPO[ev.tipo] || '📌'}</span>
    <div class="cuerpo">
      <div class="titulo-el">${esc(ev.asignatura ? `${ev.asignatura}: ` : '')}${esc(ev.titulo)}</div>
      <div class="detalle">${hora}${esc(NOMBRE_TIPO[ev.tipo])}${ev.lugar ? ` · ${esc(ev.lugar)}` : ''}${conDias ? ` · ${fechaCorta(ev.inicio.slice(0, 10))}` : ''}</div>
    </div>
    ${conDias ? `<span class="chip ${ev.dias <= 3 ? 'urgente' : ''}">${cuandoRelativo(ev.inicio)}</span>` : ''}
  </li>`;
}

function lineaRecordatorio(r, { conHecho = true } = {}) {
  const vencido = r.cuando <= ahora();
  return `<li class="elemento">
    <span class="icono-ev">${r.automatico ? '⏰' : r.repetir ? '🔁' : '🔔'}</span>
    <div class="cuerpo">
      <div class="titulo-el">${esc(r.texto)}</div>
      <div class="detalle">${vencido ? '<b>Ahora</b> · ' : ''}${esc(fechaCorta(r.cuando))}${r.repetir ? ` · ${r.repetir}` : ''}${r.automatico ? ' · aviso automático' : ''}</div>
    </div>
    <div class="acciones">
      ${conHecho ? `<button class="boton-icono" data-hecho="${r.id}" aria-label="Hecho">✓</button>` : ''}
      ${!r.automatico ? `<button class="boton-icono" data-cal-rec="${r.id}" aria-label="Al calendario">📅</button>` : ''}
    </div>
  </li>`;
}

function enlazarListas(raiz) {
  for (const li of $$('[data-evento]', raiz)) li.onclick = () => hojaEvento(Number(li.dataset.evento));
  for (const b of $$('[data-hecho]', raiz)) {
    b.onclick = async (ev) => {
      ev.stopPropagation();
      await datos.completarRecordatorio(b.dataset.hecho);
      aviso('✓ Hecho');
      render();
    };
  }
  for (const b of $$('[data-cal-rec]', raiz)) {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const r = E().recordatorios.find((x) => x.id === Number(b.dataset.calRec));
      if (r) hojaCalendario({ recordatorios: [r], titulo: r.texto });
    };
  }
}

function vistaHoy() {
  const r = datos.resumenDiario();
  const vencidos = datos.verRecordatorios({ solo_vencidos: true });
  const proxRec = datos.verRecordatorios().filter((x) => x.cuando > ahora() && x.cuando.slice(0, 10) <= sumarDias(hoy(), 2) && !x.automatico);
  const hora = new Date().getHours();
  const saludo = hora < 7 ? '🌙 Buenas noches' : hora < 13 ? '☀️ Buenos días' : hora < 21 ? '🌤️ Buenas tardes' : '🌙 Buenas noches';
  const sinClave = !E().ajustes.apiKey;
  const sinDatos = !E().asignaturas.length && !E().eventos.length;

  // Clases: las de hoy; si ya han terminado todas, las del próximo día con clase
  const horaAhora = ahora().slice(11);
  let diaClases = hoy();
  let clases = datos.clasesDelDia(diaClases);
  let etiquetaClases = 'Clases de hoy';
  if (!clases.some((c) => c.fin > horaAhora && !c.cancelada) && E().horario.length) {
    for (let i = 1; i <= 7; i++) {
      const f = sumarDias(hoy(), i);
      const cs = datos.clasesDelDia(f);
      if (cs.some((c) => !c.cancelada)) {
        diaClases = f;
        clases = cs;
        etiquetaClases = i === 1 ? 'Clases de mañana' : `Clases del ${fechaCorta(f)}`;
        break;
      }
    }
  }
  const proximoExamen = datos.buscarEventos({ desde: hoy() }).find((x) => x.tipo === 'examen' || x.tipo === 'examen_laboratorio');

  contenido.innerHTML = `
    <p class="suave" style="margin:0">${saludo} · ${esc(bonito(hoy()))}</p>

    <div class="tarjeta verde">
      ${proximoExamen ? `<div class="suave pequeno">Próximo examen</div>
        <div class="numero-grande">${diasHasta(proximoExamen.inicio) === 0 ? '¡Hoy!' : diasHasta(proximoExamen.inicio) === 1 ? 'Mañana' : `${diasHasta(proximoExamen.inicio)} días`}</div>
        <div class="suave">${esc(proximoExamen.asignatura || '')} · ${esc(proximoExamen.titulo)} · ${esc(fechaCorta(proximoExamen.inicio))}</div>`
        : `<div class="suave pequeno">Próximo examen</div><div class="numero-grande">—</div><div class="suave">No tienes exámenes guardados</div>`}
      ${E().horario.length ? `<h3 style="color:rgb(255 255 255 / .8);margin-top:16px">${esc(etiquetaClases)}</h3>
        ${clases.length ? `<div>${clases.map((c) => filaClase(c, diaClases === hoy())).join('')}</div>` : '<p class="suave">Sin clases 🎉</p>'}` : ''}
    </div>

    <div class="accesos">
      <a href="#horario"><span class="circulo">🗓️</span>Horario</a>
      <a href="#notas"><span class="circulo">📝</span>Notas</a>
      <a href="#anadir"><span class="circulo">➕</span>Añadir</a>
      <a href="#chat"><span class="circulo">💬</span>Chat</a>
    </div>

    ${sinClave ? `<div class="tarjeta alerta"><h2>🔑 Falta un paso</h2><p>Para que el chat y la lectura de documentos funcionen, pega tu clave gratuita de IA.</p><a class="boton" href="#ajustes">Ir a Ajustes</a></div>` : ''}

    ${sinDatos ? `<div class="tarjeta destacada"><h2>👋 Empieza aquí</h2>
      <p>Dale a la app la información de tus asignaturas: escríbela, pega la web de la uni o sube el PDF del calendario de exámenes.</p>
      <div class="fila-botones"><a class="boton" href="#anadir">➕ Añadir información</a><a class="boton secundario" href="#chat">💬 Contárselo al chat</a></div></div>` : ''}

    ${vencidos.length ? `<div class="tarjeta alerta"><h2>🔔 Avisos</h2><ul class="lista">${vencidos.map((x) => lineaRecordatorio(x)).join('')}</ul></div>` : ''}

    <div class="tarjeta">
      <h2>Hoy</h2>
      ${r.hoy.length ? `<ul class="lista">${r.hoy.map((x) => lineaEvento(x)).join('')}</ul>` : '<p class="suave">Nada en la agenda 🎉</p>'}
      ${r.manana.length ? `<h3>Mañana</h3><ul class="lista">${r.manana.map((x) => lineaEvento(x)).join('')}</ul>` : ''}
    </div>

    ${r.proximos.length ? `<div class="tarjeta"><h2>Exámenes y entregas · próximas 2 semanas</h2><ul class="lista">${r.proximos.map((x) => lineaEvento(x, true)).join('')}</ul></div>` : ''}

    ${proxRec.length ? `<div class="tarjeta"><h2>Próximos recordatorios</h2><ul class="lista">${proxRec.map((x) => lineaRecordatorio(x, { conHecho: false })).join('')}</ul></div>` : ''}
  `;
  enlazarListas(contenido);
  enlazarClases(contenido);
}

// =====================================================================
// CHAT
// =====================================================================

let adjuntosChat = [];
let chatOcupado = false;

const SUGERENCIAS = [
  '¿Qué exámenes tengo este mes?',
  '¿Qué asignaturas tienen examen final de laboratorio?',
  'Recuérdame mañana a las 8 llevar la bata',
  'Memoriza que mi tutor es…',
];

function vistaChat() {
  const hist = E().historial;
  contenido.innerHTML = `
    <div class="chat">
      <div class="mensajes" id="mensajes">
        ${hist.length ? hist.map((m) => burbuja(m.rol, m.texto)).join('') : `
          <div class="sugerencias">
            <p class="suave pequeno" style="width:100%;text-align:center">Pregúntame o cuéntame lo que quieras guardar.<br>Puedes adjuntar fotos y PDF 📎 y usar el micrófono del teclado 🎤</p>
            ${SUGERENCIAS.map((s) => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('')}
          </div>`}
      </div>
      <div class="adjuntos" id="adjuntos"></div>
      <form class="barra-chat" id="form-chat">
        <button type="button" class="boton-icono" id="adjuntar" aria-label="Adjuntar foto o archivo">📎</button>
        <textarea id="entrada" rows="1" placeholder="Escribe un mensaje…" enterkeyhint="send"></textarea>
        <button type="submit" class="boton-icono" id="enviar" aria-label="Enviar" style="background:var(--acento);color:var(--acento-texto)">➤</button>
      </form>
    </div>`;
  const msgs = $('#mensajes');
  msgs.scrollTop = msgs.scrollHeight;
  pintarAdjuntos();

  const entrada = $('#entrada');
  entrada.addEventListener('input', () => {
    entrada.style.height = 'auto';
    entrada.style.height = `${Math.min(entrada.scrollHeight, 140)}px`;
  });
  entrada.addEventListener('keydown', (ev) => {
    // En ordenador, Enter envía (Mayús+Enter = nueva línea)
    if (ev.key === 'Enter' && !ev.shiftKey && !('ontouchstart' in window)) {
      ev.preventDefault();
      $('#form-chat').requestSubmit();
    }
  });
  for (const b of $$('[data-sug]')) {
    b.onclick = () => {
      entrada.value = b.dataset.sug.replace('…', ' ');
      entrada.focus();
    };
  }
  $('#adjuntar').onclick = () => {
    abrirHoja(
      `<h2>Adjuntar</h2>
       <button class="boton ancho" id="adj-camara">📷 Hacer foto</button>
       <button class="boton secundario ancho" id="adj-foto" style="margin-top:8px">🖼️ Foto de la galería</button>
       <button class="boton secundario ancho" id="adj-archivo" style="margin-top:8px">📄 PDF o archivo</button>`,
      (h) => {
        const coger = async (accept, capture) => {
          cerrarHoja();
          const f = await elegirArchivo(accept, capture);
          if (!f) return;
          try {
            const a = await leerArchivo(f);
            if (a.texto !== undefined) {
              entrada.value = `${entrada.value}\n\nContenido de ${a.nombre}:\n${a.texto}`.trim();
            } else adjuntosChat.push(a);
            pintarAdjuntos();
          } catch (e) {
            aviso(e.message);
          }
        };
        $('#adj-camara', h).onclick = () => coger('image/*', true);
        $('#adj-foto', h).onclick = () => coger('image/*');
        $('#adj-archivo', h).onclick = () => coger('application/pdf,image/*,text/*,.txt,.md,.csv');
      },
    );
  };
  $('#form-chat').onsubmit = (ev) => {
    ev.preventDefault();
    enviarChat();
  };
}

function burbuja(rol, texto, extra = '') {
  return rol === 'user'
    ? `<div class="burbuja yo">${esc(texto).replace(/\n/g, '<br>')}</div>`
    : `<div class="burbuja ia ${extra}"><div class="texto-ia">${formatear(texto)}</div></div>`;
}

function pintarAdjuntos() {
  const cont = $('#adjuntos');
  if (!cont) return;
  cont.innerHTML = adjuntosChat.map((a, i) => `<span class="adjunto">${a.mimeType.startsWith('image') ? '🖼️' : '📄'} ${esc(a.nombre)}<button data-quitar="${i}" aria-label="Quitar">✕</button></span>`).join('');
  for (const b of $$('[data-quitar]', cont)) {
    b.onclick = () => {
      adjuntosChat.splice(Number(b.dataset.quitar), 1);
      pintarAdjuntos();
    };
  }
}

const NOMBRE_ACCION = {
  guardar_asignatura: 'asignatura guardada', crear_evento: 'evento guardado', modificar_evento: 'evento cambiado', borrar_evento: 'evento borrado',
  crear_recordatorio: 'recordatorio creado', borrar_recordatorio: 'recordatorio borrado', memorizar: 'dato memorizado', modificar_memoria: 'dato corregido',
  olvidar: 'dato olvidado', borrar_asignatura: 'asignatura borrada',
};

async function enviarChat() {
  if (chatOcupado) return;
  const entrada = $('#entrada');
  const texto = entrada.value.trim();
  if (!texto && !adjuntosChat.length) return;
  const adjuntos = adjuntosChat;
  adjuntosChat = [];
  entrada.value = '';
  entrada.style.height = '';
  pintarAdjuntos();

  const msgs = $('#mensajes');
  $('.sugerencias', msgs)?.remove();
  const desc = adjuntos.map((a) => `[${a.nombre}]`).join(' ');
  msgs.insertAdjacentHTML('beforeend', burbuja('user', [desc, texto].filter(Boolean).join(' ')));
  msgs.insertAdjacentHTML('beforeend', '<div class="burbuja ia pensando" id="pensando">Pensando…</div>');
  msgs.scrollTop = msgs.scrollHeight;
  chatOcupado = true;
  $('#enviar').disabled = true;

  try {
    const r = await conversar({ datos, almacen, texto, adjuntos });
    const cambios = [...new Set(r.acciones.map((a) => NOMBRE_ACCION[a]).filter(Boolean))];
    if (vistaActual !== 'chat') return aviso('💬 El asistente ha respondido en el Chat');
    $('#pensando')?.remove();
    msgs.insertAdjacentHTML('beforeend', burbuja('model', r.texto));
    if (cambios.length) msgs.lastElementChild.insertAdjacentHTML('beforeend', `<div class="acciones-ia">✓ ${cambios.join(' · ')}</div>`);
  } catch (e) {
    $('#pensando')?.remove();
    msgs.insertAdjacentHTML('beforeend', burbuja('model', e instanceof ErrorIA ? e.message : `❌ Error: ${e.message}`, 'error'));
    if (!texto) adjuntosChat = adjuntos; // para poder reintentar
    else if (!entrada.value) entrada.value = texto;
    pintarAdjuntos();
  } finally {
    chatOcupado = false;
    if ($('#enviar')) $('#enviar').disabled = false;
    msgs.scrollTop = msgs.scrollHeight;
    actualizarGlobo();
  }
}

// =====================================================================
// AGENDA
// =====================================================================

let seccionAgenda = 'eventos';
let verPasados = false;

function vistaAgenda() {
  const secciones = { eventos: 'Eventos', asignaturas: 'Asignaturas', recordatorios: 'Avisos', memoria: 'Memoria' };
  contenido.innerHTML = `
    <div class="segmentos" role="tablist">${Object.entries(secciones).map(([k, v]) => `<button role="tab" class="${k === seccionAgenda ? 'activo' : ''}" data-sec="${k}">${v}</button>`).join('')}</div>
    <div id="seccion"></div>`;
  for (const b of $$('[data-sec]')) {
    b.onclick = () => {
      seccionAgenda = b.dataset.sec;
      vistaAgenda();
    };
  }
  ({ eventos: seccionEventos, asignaturas: seccionAsignaturas, recordatorios: seccionRecordatorios, memoria: seccionMemoria })[seccionAgenda]($('#seccion'));
}

function seccionEventos(cont) {
  const todos = datos.buscarEventos();
  const lista = todos.filter((ev) => (verPasados ? ev.inicio.slice(0, 10) < hoy() : ev.inicio.slice(0, 10) >= hoy()));
  if (verPasados) lista.reverse();
  let mesAnterior = '';
  const items = lista
    .map((ev) => {
      const mes = bonito(ev.inicio.slice(0, 10)).replace(/^\S+ \d+ de /, '');
      const cab = mes !== mesAnterior ? `<li class="mes">${esc(mes)}</li>` : '';
      mesAnterior = mes;
      return cab + lineaEvento({ ...ev, dias: diasHasta(ev.inicio) }, true);
    })
    .join('');
  const futuros = todos.filter((ev) => ev.inicio.slice(0, 10) >= hoy());
  cont.innerHTML = `
    <div class="fila-botones">
      <button class="boton" id="nuevo-evento">＋ Nuevo evento</button>
      ${futuros.length ? `<button class="boton secundario" id="todo-cal">📅 Todo al calendario</button>` : ''}
    </div>
    <div class="tarjeta">
      ${lista.length ? `<ul class="lista">${items}</ul>` : `<p class="vacio">${verPasados ? 'No hay eventos pasados.' : 'No hay nada próximo.<br>Añade eventos aquí, desde el Chat o en ➕ Añadir.'}</p>`}
    </div>
    <button class="boton secundario ancho" id="pasados">${verPasados ? 'Ver próximos' : 'Ver pasados'}</button>`;
  $('#nuevo-evento').onclick = () => hojaFormEvento();
  $('#pasados').onclick = () => {
    verPasados = !verPasados;
    vistaAgenda();
  };
  if ($('#todo-cal')) {
    $('#todo-cal').onclick = () =>
      hojaCalendario({ eventos: futuros, recordatorios: E().recordatorios.filter((r) => !r.hecho), titulo: `Universidad: ${futuros.length} eventos y tus recordatorios` });
  }
  enlazarListas(cont);
}

function hojaEvento(id) {
  const ev = datos.buscarEventos().find((x) => x.id === id);
  if (!ev) return;
  const asig = E().asignaturas.find((a) => a.id === ev.asignaturaId);
  abrirHoja(
    `<h2>${ICONO_TIPO[ev.tipo]} ${esc(ev.titulo)}</h2>
     <div class="tarjeta">
       <p><b>${esc(NOMBRE_TIPO[ev.tipo])}</b>${ev.asignatura ? ` · ${esc(ev.asignatura)}` : ''}</p>
       <p>🗓️ ${esc(bonito(ev.inicio))}${ev.fin ? ` → ${esc(ev.fin.slice(0, 10) === ev.inicio.slice(0, 10) ? ev.fin.slice(11) : bonito(ev.fin))}` : ''} <span class="chip">${cuandoRelativo(ev.inicio)}</span></p>
       ${ev.lugar ? `<p>📍 ${esc(ev.lugar)}</p>` : ''}
       ${ev.notas ? `<p>📝 ${esc(ev.notas)}</p>` : ''}
       ${asig && ev.tipo === 'examen' && asig.examen_final_lab !== null ? `<p class="suave pequeno">${asig.examen_final_lab ? '🧪 Esta asignatura tiene examen final de laboratorio' : 'Sin examen final de laboratorio'}</p>` : ''}
       ${TIPOS_CON_AVISO.has(ev.tipo) ? `<p class="suave pequeno">⏰ Avisos ${E().ajustes.avisosDias.join(', ')} días antes</p>` : ''}
     </div>
     <button class="boton ancho" id="ev-cal">📅 Añadir al calendario del móvil</button>
     <div class="fila-botones">
       <button class="boton secundario" id="ev-editar" style="flex:1">✏️ Editar</button>
       <button class="boton peligro" id="ev-borrar" style="flex:1">🗑️ Borrar</button>
     </div>`,
    (h) => {
      $('#ev-cal', h).onclick = () => hojaCalendario({ eventos: [ev], titulo: `${ev.asignatura ? `${ev.asignatura} ` : ''}${ev.titulo}` });
      $('#ev-editar', h).onclick = () => hojaFormEvento(ev);
      $('#ev-borrar', h).onclick = async () => {
        if (!confirmar(`¿Borrar "${ev.titulo}"?`)) return;
        await datos.borrarEvento(ev.id);
        cerrarHoja();
        aviso('🗑️ Evento borrado');
        render();
      };
    },
  );
}

function opcionesAsignaturas() {
  return `<datalist id="lista-asig">${E().asignaturas.map((a) => `<option value="${esc(a.nombre)}">`).join('')}</datalist>`;
}

function hojaFormEvento(ev = null) {
  const fecha = ev ? ev.inicio.slice(0, 10) : hoy();
  const hora = ev && tieneHora(ev.inicio) ? ev.inicio.slice(11) : '';
  const horaFin = ev?.fin && tieneHora(ev.fin) ? ev.fin.slice(11) : '';
  abrirHoja(
    `<h2>${ev ? 'Editar evento' : 'Nuevo evento'}</h2>
     <form id="f-ev">
       <label class="campo"><span>Tipo</span><select name="tipo">${TIPOS_EVENTO.map((t) => `<option value="${t}" ${ev?.tipo === t ? 'selected' : ''}>${ICONO_TIPO[t]} ${NOMBRE_TIPO[t]}</option>`).join('')}</select></label>
       <label class="campo"><span>Asignatura</span><input name="asignatura" list="lista-asig" value="${esc(ev?.asignatura || '')}" placeholder="Ej: Física II" autocomplete="off">${opcionesAsignaturas()}</label>
       <label class="campo"><span>Título</span><input name="titulo" required value="${esc(ev?.titulo || '')}" placeholder="Ej: Parcial 1 (temas 1-4)"></label>
       <div class="dos-columnas">
         <label class="campo"><span>Día</span><input type="date" name="fecha" required value="${fecha}"></label>
         <label class="campo"><span>Hora (opcional)</span><input type="time" name="hora" value="${hora}"></label>
       </div>
       <label class="campo"><span>Hora de fin (opcional)</span><input type="time" name="horaFin" value="${horaFin}"></label>
       ${ev ? '' : `<label class="campo"><span>Se repite cada semana hasta (opcional)</span><input type="date" name="hasta"></label>`}
       <label class="campo"><span>Lugar</span><input name="lugar" value="${esc(ev?.lugar || '')}" placeholder="Ej: Aula 2.3"></label>
       <label class="campo"><span>Notas</span><textarea name="notas" placeholder="Temario, material, % de nota…">${esc(ev?.notas || '')}</textarea></label>
       <button class="boton ancho">Guardar</button>
     </form>`,
    (h) => {
      $('#f-ev', h).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const inicio = f.hora ? `${f.fecha}T${f.hora}` : f.fecha;
        const fin = f.horaFin && f.hora ? `${f.fecha}T${f.horaFin}` : null;
        try {
          const campos = { tipo: f.tipo, asignatura: f.asignatura, titulo: f.titulo, inicio, fin, lugar: f.lugar, notas: f.notas };
          if (ev) await datos.modificarEvento({ id: ev.id, ...campos });
          else await datos.crearEvento({ ...campos, repetir_semanal_hasta: f.hasta || undefined });
          cerrarHoja();
          aviso('✓ Guardado');
          render();
        } catch (err) {
          aviso(err.message);
        }
      };
    },
  );
}

function seccionAsignaturas(cont) {
  const lista = datos.verAsignaturas();
  cont.innerHTML = `
    <div class="fila-botones"><button class="boton" id="nueva-asig">＋ Nueva asignatura</button></div>
    ${lista.length ? lista.map((a) => {
      const prox = a.eventos.filter((ev) => ev.inicio.slice(0, 10) >= hoy());
      const examen = prox.find((ev) => ev.tipo === 'examen');
      return `<div class="tarjeta tocable" data-asig="${a.id}" style="cursor:pointer">
        <h2>${esc(a.nombre)}</h2>
        <div class="detalle suave pequeno">${[a.profesor && `👤 ${esc(a.profesor)}`, a.curso && `${esc(a.curso)}º`, a.cuatrimestre && `${esc(a.cuatrimestre)} cuatri.`].filter(Boolean).join(' · ')}</div>
        <p style="margin:8px 0 0">
          <span class="chip ${a.examen_final_lab ? 'urgente' : ''}">🧪 Final de lab: ${a.examen_final_lab === null ? '¿?' : a.examen_final_lab ? 'sí' : 'no'}</span>
          ${examen ? `<span class="chip">📝 Examen ${fechaCorta(examen.inicio.slice(0, 10))}</span>` : ''}
          <span class="chip">${prox.length} próximos</span>
        </p>
      </div>`;
    }).join('') : '<div class="tarjeta"><p class="vacio">Aún no hay asignaturas.</p></div>'}`;
  $('#nueva-asig').onclick = () => hojaFormAsignatura();
  for (const t of $$('[data-asig]', cont)) t.onclick = () => hojaAsignatura(Number(t.dataset.asig));
}

function hojaAsignatura(id) {
  const a = datos.verAsignaturas().find((x) => x.id === id);
  if (!a) return;
  abrirHoja(
    `<h2>${esc(a.nombre)}</h2>
     <div class="tarjeta">
       ${a.profesor ? `<p>👤 ${esc(a.profesor)}</p>` : ''}
       ${a.curso || a.cuatrimestre ? `<p>🎓 ${[a.curso && `Curso ${esc(a.curso)}`, a.cuatrimestre && `Cuatrimestre ${esc(a.cuatrimestre)}`].filter(Boolean).join(' · ')}</p>` : ''}
       <p>🧪 Examen final de laboratorio: <b>${a.examen_final_lab === null ? 'no se sabe' : a.examen_final_lab ? 'sí' : 'no'}</b></p>
       ${a.info ? `<p>ℹ️ ${esc(a.info).replace(/\n/g, '<br>')}</p>` : ''}
     </div>
     <div class="tarjeta"><h2>Fechas</h2>${a.eventos.length ? `<ul class="lista">${a.eventos.map((ev) => lineaEvento({ ...ev, asignatura: null, dias: diasHasta(ev.inicio) }, true)).join('')}</ul>` : '<p class="suave">Sin fechas todavía.</p>'}</div>
     <div class="fila-botones">
       <button class="boton secundario" id="as-editar" style="flex:1">✏️ Editar</button>
       <button class="boton peligro" id="as-borrar" style="flex:1">🗑️ Borrar</button>
     </div>`,
    (h) => {
      enlazarListas(h);
      $('#as-editar', h).onclick = () => hojaFormAsignatura(a);
      $('#as-borrar', h).onclick = async () => {
        if (!confirmar(`¿Borrar "${a.nombre}" y sus ${a.eventos.length} fechas? No se puede deshacer.`)) return;
        await datos.borrarAsignatura(a.id);
        cerrarHoja();
        aviso('🗑️ Asignatura borrada');
        render();
      };
    },
  );
}

function hojaFormAsignatura(a = null) {
  const lab = a?.examen_final_lab;
  abrirHoja(
    `<h2>${a ? 'Editar asignatura' : 'Nueva asignatura'}</h2>
     <form id="f-as">
       <label class="campo"><span>Nombre</span><input name="nombre" required value="${esc(a?.nombre || '')}" placeholder="Ej: Física II"></label>
       <label class="campo"><span>Profesor/a</span><input name="profesor" value="${esc(a?.profesor || '')}"></label>
       <div class="dos-columnas">
         <label class="campo"><span>Curso</span><input name="curso" value="${esc(a?.curso || '')}" placeholder="2"></label>
         <label class="campo"><span>Cuatrimestre</span><input name="cuatrimestre" value="${esc(a?.cuatrimestre || '')}" placeholder="1"></label>
       </div>
       <label class="campo"><span>¿Tiene examen final de laboratorio?</span>
         <select name="lab"><option value="" ${lab == null ? 'selected' : ''}>No lo sé</option><option value="si" ${lab === true ? 'selected' : ''}>Sí</option><option value="no" ${lab === false ? 'selected' : ''}>No</option></select></label>
       <label class="campo"><span>Más información</span><textarea name="info" placeholder="Cómo se evalúa, % de cada parte, tutorías, requisitos…">${esc(a?.info || '')}</textarea></label>
       <button class="boton ancho">Guardar</button>
     </form>`,
    (h) => {
      $('#f-as', h).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        try {
          if (a && f.nombre.trim().toLowerCase() !== a.nombre.toLowerCase()) {
            await datos.guardarAsignatura({ nombre: a.nombre, nombre_nuevo: f.nombre });
          }
          await datos.guardarAsignatura({
            nombre: f.nombre, profesor: f.profesor, curso: f.curso, cuatrimestre: f.cuatrimestre, info: f.info,
            tiene_examen_final_laboratorio: f.lab === '' ? null : f.lab === 'si',
          });
          cerrarHoja();
          aviso('✓ Guardado');
          render();
        } catch (err) {
          aviso(err.message);
        }
      };
    },
  );
}

function seccionRecordatorios(cont) {
  const lista = datos.verRecordatorios();
  const mios = lista.filter((r) => !r.automatico);
  cont.innerHTML = `
    <div class="fila-botones">
      <button class="boton" id="nuevo-rec">＋ Nuevo recordatorio</button>
      ${mios.length ? '<button class="boton secundario" id="rec-cal">📅 Todos al calendario</button>' : ''}
    </div>
    <div class="tarjeta">${lista.length ? `<ul class="lista">${lista.map((r) => lineaRecordatorio(r)).join('')}</ul>` : '<p class="vacio">No hay recordatorios pendientes.</p>'}</div>
    <p class="suave pequeno">💡 La app te avisa cuando la abres. Para que el móvil te avise <b>aunque la app esté cerrada</b>, pasa los recordatorios y exámenes al calendario del móvil con 📅.</p>`;
  $('#nuevo-rec').onclick = () => hojaFormRecordatorio();
  if ($('#rec-cal')) $('#rec-cal').onclick = () => hojaCalendario({ recordatorios: mios, titulo: `${mios.length} recordatorios` });
  enlazarListas(cont);
}

function hojaFormRecordatorio() {
  const manana = sumarDias(hoy(), 1);
  abrirHoja(
    `<h2>Nuevo recordatorio</h2>
     <form id="f-rec">
       <label class="campo"><span>¿Qué te recuerdo?</span><input name="texto" required placeholder="Ej: Llevar la bata al laboratorio"></label>
       <div class="dos-columnas">
         <label class="campo"><span>Día</span><input type="date" name="fecha" required value="${manana}"></label>
         <label class="campo"><span>Hora</span><input type="time" name="hora" required value="09:00"></label>
       </div>
       <label class="campo"><span>Repetir</span><select name="repetir"><option value="">No</option><option value="diario">Cada día</option><option value="semanal">Cada semana</option><option value="mensual">Cada mes</option></select></label>
       <button class="boton ancho">Guardar</button>
     </form>`,
    (h) => {
      $('#f-rec', h).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const r = await datos.crearRecordatorio({ texto: `🔔 ${f.texto}`, cuando: `${f.fecha}T${f.hora}`, repetir: f.repetir || undefined });
        if (!r.ok) return aviso(r.error);
        const nuevo = E().recordatorios.find((x) => x.id === r.id);
        render();
        hojaCalendario({ recordatorios: [nuevo], titulo: `Guardado ✓ — ¿Lo pasas también al calendario para que te avise con la app cerrada?` });
      };
    },
  );
}

function seccionMemoria(cont) {
  const lista = [...E().memoria].reverse();
  cont.innerHTML = `
    <form id="f-mem" class="tarjeta">
      <label class="campo" style="margin-top:0"><span>Memoriza que…</span><textarea name="texto" required style="min-height:70px" placeholder="Ej: Mi tutor es Luis Pérez, despacho 2.01"></textarea></label>
      <button class="boton ancho">Guardar en la memoria</button>
    </form>
    <div class="tarjeta">${lista.length ? `<ul class="lista">${lista.map((m) => `<li class="elemento"><span class="icono-ev">🧠</span><div class="cuerpo"><div>${esc(m.texto)}</div><div class="detalle">${esc(fechaCorta(m.creado))}</div></div><button class="boton-icono" data-olvidar="${m.id}" aria-label="Borrar">🗑️</button></li>`).join('')}</ul>` : '<p class="vacio">Aquí aparecerá lo que le pidas que memorice.</p>'}</div>`;
  $('#f-mem').onsubmit = async (e) => {
    e.preventDefault();
    await datos.memorizar({ texto: new FormData(e.target).get('texto') });
    aviso('🧠 Memorizado');
    vistaAgenda();
  };
  for (const b of $$('[data-olvidar]', cont)) {
    b.onclick = async () => {
      if (!confirmar('¿Olvidar este dato?')) return;
      await datos.olvidar(b.dataset.olvidar);
      vistaAgenda();
    };
  }
}

// =====================================================================
// AÑADIR INFORMACIÓN
// =====================================================================

let modoAnadir = 'texto';
let archivoAnadir = null;
let procesando = false;

const ICONO_DOC = { texto: '✍️', url: '🔗', archivo: '📄', imagen: '🖼️' };

function vistaAnadir() {
  const modos = { texto: '✍️ Escribir', url: '🔗 Web', archivo: '📄 Archivo', imagen: '🖼️ Imagen' };
  const docs = [...E().conocimiento].reverse();
  let formulario = '';
  if (modoAnadir === 'texto') {
    formulario = `
      <label class="campo"><span>Título (opcional)</span><input name="titulo" placeholder="Ej: Normas del laboratorio de Química"></label>
      <label class="campo"><span>Información</span><textarea name="texto" required style="min-height:180px" placeholder="Escribe o pega aquí lo que quieras: fechas de exámenes, cómo se evalúa cada asignatura, apuntes, normas…"></textarea></label>`;
  } else if (modoAnadir === 'url') {
    formulario = `
      <label class="campo"><span>Enlace de la web</span><input name="url" type="url" required inputmode="url" placeholder="https://www.tu-uni.es/calendario-examenes"></label>
      <p class="suave pequeno">La página tiene que ser pública (sin iniciar sesión). Si la web pide usuario y contraseña, copia el texto y usa ✍️ Escribir, o guárdala como PDF.</p>`;
  } else {
    const esImg = modoAnadir === 'imagen';
    formulario = `
      <div class="zona-archivo" id="zona">
        ${archivoAnadir ? (archivoAnadir.mimeType?.startsWith('image') ? `<img class="vista-previa" src="data:${archivoAnadir.mimeType};base64,${archivoAnadir.data}" alt="">` : '<span class="grande">📄</span>') + `<b>${esc(archivoAnadir.nombre)}</b><span class="pequeno">Toca para cambiarlo</span>`
          : `<span class="grande">${esImg ? '📷' : '📄'}</span><b>${esImg ? 'Toca para hacer una foto o elegirla' : 'Toca para elegir un PDF o archivo de texto'}</b><span class="pequeno">${esImg ? 'Calendarios, horarios, la pizarra, el tablón…' : 'Guías docentes, calendario de exámenes, apuntes…'}</span>`}
      </div>
      ${esImg ? '<button type="button" class="boton secundario ancho" id="camara" style="margin-top:8px">📷 Hacer foto ahora</button>' : ''}`;
  }
  contenido.innerHTML = `
    <p class="suave" style="margin:0">Todo lo que añadas aquí lo usará el asistente para responderte. Además, puede pasar a tu agenda las fechas que encuentre.</p>
    <div class="segmentos">${Object.entries(modos).map(([k, v]) => `<button class="${k === modoAnadir ? 'activo' : ''}" data-modo="${k}">${v}</button>`).join('')}</div>
    <form class="tarjeta" id="f-anadir">
      ${formulario}
      <label class="casilla"><input type="checkbox" name="organizar" checked> <span>Pasar a la agenda las asignaturas y fechas que encuentre</span></label>
      <button class="boton ancho" id="b-anadir" ${procesando ? 'disabled' : ''}>${procesando ? 'Procesando…' : 'Añadir al asistente'}</button>
      <div id="resultado"></div>
    </form>

    <h2 style="font-size:1.05rem;margin:22px 0 4px">📚 Información guardada (${docs.length})</h2>
    <div class="tarjeta">
      ${docs.length ? `<ul class="lista">${docs.map((d) => `<li class="elemento tocable" data-doc="${d.id}"><span class="icono-ev">${ICONO_DOC[d.tipo] || '📄'}</span><div class="cuerpo"><div class="titulo-el">${esc(d.titulo)}</div><div class="detalle">${esc(fechaCorta(d.creado))} · ${Math.max(1, Math.round(d.contenido.length / 1000))} mil caracteres${d.origen ? ` · ${esc(d.origen)}` : ''}</div></div></li>`).join('')}</ul>` : '<p class="vacio">Aún no has añadido nada.</p>'}
    </div>`;

  for (const b of $$('[data-modo]')) {
    b.onclick = () => {
      if (procesando) return;
      modoAnadir = b.dataset.modo;
      archivoAnadir = null;
      vistaAnadir();
    };
  }
  const coger = async (accept, capture) => {
    const f = await elegirArchivo(accept, capture);
    if (!f) return;
    try {
      archivoAnadir = await leerArchivo(f);
      vistaAnadir();
    } catch (e) {
      aviso(e.message);
    }
  };
  if ($('#zona')) $('#zona').onclick = () => coger(modoAnadir === 'imagen' ? 'image/*' : 'application/pdf,text/*,.txt,.md,.csv,.json');
  if ($('#camara')) $('#camara').onclick = () => coger('image/*', true);
  for (const li of $$('[data-doc]')) li.onclick = () => hojaDocumento(Number(li.dataset.doc));
  $('#f-anadir').onsubmit = (e) => {
    e.preventDefault();
    procesarAnadir(new FormData(e.target));
  };
}

async function procesarAnadir(form) {
  if (procesando) return;
  const organizar = form.get('organizar') === 'on';
  const ajustes = E().ajustes;
  const paso = (t) => {
    if ($('#resultado')) $('#resultado').innerHTML = `<p class="suave">${t}</p>`;
  };

  if ((modoAnadir === 'archivo' || modoAnadir === 'imagen') && !archivoAnadir) return aviso('Primero elige un archivo');
  if (modoAnadir !== 'texto' && !ajustes.apiKey) return aviso('🔑 Para leer webs, archivos e imágenes necesitas la clave de IA (Ajustes)');

  procesando = true;
  $('#b-anadir').disabled = true;
  $('#b-anadir').textContent = 'Procesando…';
  try {
    let titulo;
    let contenidoDoc;
    let origen = null;
    if (modoAnadir === 'texto') {
      contenidoDoc = form.get('texto').trim();
      titulo = form.get('titulo').trim() || contenidoDoc.split('\n')[0].slice(0, 60);
    } else if (modoAnadir === 'url') {
      origen = form.get('url').trim();
      paso('🔗 Leyendo la web…');
      ({ titulo, contenido: contenidoDoc } = await extraerContenido({ ajustes, url: origen }));
    } else if (archivoAnadir.texto !== undefined) {
      titulo = archivoAnadir.nombre;
      contenidoDoc = archivoAnadir.texto;
      origen = archivoAnadir.nombre;
    } else {
      origen = archivoAnadir.nombre;
      paso(modoAnadir === 'imagen' ? '🖼️ Leyendo la imagen…' : '📄 Leyendo el documento…');
      ({ titulo, contenido: contenidoDoc } = await extraerContenido({ ajustes, archivo: archivoAnadir }));
    }
    const doc = await datos.anadirConocimiento({ titulo, tipo: modoAnadir, origen, contenido: contenidoDoc });
    archivoAnadir = null;

    let resumen = '';
    if (organizar && ajustes.apiKey) {
      paso('🗂️ Pasando a la agenda las fechas y asignaturas…');
      resumen = (await organizarInformacion({ datos, ajustes, titulo, contenido: contenidoDoc })).texto;
    } else if (organizar) {
      resumen = 'Guardado. (Sin clave de IA no puedo pasar las fechas a la agenda automáticamente.)';
    }
    procesando = false;
    vistaAnadir();
    $('#resultado').innerHTML = `<div class="tarjeta destacada"><b>✓ Añadido: ${esc(doc.titulo)}</b>${resumen ? `<div class="texto-ia" style="margin-top:6px">${formatear(resumen)}</div>` : ''}</div>`;
  } catch (e) {
    procesando = false;
    vistaAnadir();
    $('#resultado').innerHTML = `<div class="tarjeta alerta">${esc(e instanceof ErrorIA ? e.message : `❌ ${e.message}`)}</div>`;
  } finally {
    procesando = false;
    actualizarGlobo();
  }
}

function hojaDocumento(id) {
  const d = E().conocimiento.find((x) => x.id === id);
  if (!d) return;
  abrirHoja(
    `<h2>${ICONO_DOC[d.tipo] || '📄'} ${esc(d.titulo)}</h2>
     <p class="suave pequeno">Añadido ${esc(bonito(d.creado))}${d.origen ? ` · ${/^https?:/.test(d.origen) ? `<a href="${esc(d.origen)}" target="_blank" rel="noopener">${esc(d.origen)}</a>` : esc(d.origen)}` : ''}</p>
     <div class="contenido-doc">${esc(d.contenido)}</div>
     <div class="fila-botones">
       <button class="boton secundario" id="doc-agenda" style="flex:1">🗂️ Pasar fechas a la agenda</button>
       <button class="boton peligro" id="doc-borrar" style="flex:1">🗑️ Borrar</button>
     </div>`,
    (h) => {
      $('#doc-borrar', h).onclick = async () => {
        if (!confirmar(`¿Borrar "${d.titulo}"? Las fechas que ya pasó a la agenda se quedan.`)) return;
        await datos.borrarConocimiento(d.id);
        cerrarHoja();
        render();
      };
      $('#doc-agenda', h).onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = 'Procesando…';
        try {
          const r = await organizarInformacion({ datos, ajustes: E().ajustes, titulo: d.titulo, contenido: d.contenido });
          $('.contenido-doc', h).insertAdjacentHTML('beforebegin', `<div class="tarjeta destacada texto-ia">${formatear(r.texto)}</div>`);
        } catch (err) {
          aviso(err.message, 6000);
        }
        b.disabled = false;
        b.textContent = '🗂️ Pasar fechas a la agenda';
      };
    },
  );
}

// =====================================================================
// HORARIO
// =====================================================================

const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
let diaHorario = null; // fecha seleccionada (YYYY-MM-DD)
let modoHorario = 'dia';

const lunesDe = (fecha) => {
  const d = aDate(fecha).getDay();
  return sumarDias(fecha, d === 0 ? -6 : 1 - d);
};

/** Una fila de clase (se usa en Hoy y en Horario). */
function filaClase(c, marcarAhora = false) {
  const h = ahora().slice(11);
  const enCurso = marcarAhora && !c.cancelada && c.inicio <= h && h < c.fin;
  const etiquetas = [
    `<span class="chip ${c.tipo}">${ICONO_CLASE[c.tipo] || ''} ${NOMBRE_CLASE[c.tipo] || c.tipo}</span>`,
    c.cancelada ? '<span class="chip cambio">Cancelada</span>' : '',
    c.extra ? '<span class="chip cambio">Solo este día</span>' : c.cambiada && !c.cancelada ? '<span class="chip cambio">Cambio este día</span>' : '',
    enCurso ? '<span class="chip">Ahora</span>' : '',
  ].join(' ');
  return `<div class="clase ${c.tipo} ${c.cancelada ? 'cancelada' : ''}" data-clase="${c.claseId ?? ''}" data-cambio="${c.cambioId ?? ''}" data-fecha="${c.fecha}">
    <div class="horas">${c.inicio}<small>${c.fin}</small></div>
    <div class="barra"></div>
    <div class="cuerpo">
      <div class="titulo-el">${esc(c.asignatura || 'Clase')}</div>
      <div class="detalle">${c.aula ? `🚪 ${esc(c.aula)}` : 'Sin aula'}${c.grupo ? ` · grupo ${esc(c.grupo)}` : ''}${c.nota ? ` · ${esc(c.nota)}` : ''}</div>
      <div style="margin-top:4px">${etiquetas}</div>
    </div>
  </div>`;
}

function vistaHorario() {
  diaHorario ||= hoy();
  const lunes = lunesDe(diaHorario);
  const finde = [5, 6].some((i) => datos.clasesDelDia(sumarDias(lunes, i)).length);
  const nDias = finde ? 7 : 5;
  const dias = Array.from({ length: nDias }, (_, i) => sumarDias(lunes, i));
  const rango = `${aDate(lunes).getDate()} – ${fechaCorta(sumarDias(lunes, nDias - 1)).replace(/^\S+ /, '')}`;

  let cuerpo;
  if (!E().horario.length && !E().cambiosClase.length) {
    cuerpo = `<div class="tarjeta"><p class="vacio">Aún no tienes horario.<br>Añade tus clases una a una, o mándale una <b>foto de tu horario</b> al Chat o en ➕ Añadir → Imagen y la IA las crea todas.</p></div>`;
  } else if (modoHorario === 'dia') {
    const clases = datos.clasesDelDia(diaHorario);
    cuerpo = `<div class="tarjeta">
      <h2 class="mayus">${esc(fechaCorta(diaHorario))}</h2>
      ${clases.length ? clases.map((c) => filaClase(c, diaHorario === hoy())).join('') : '<p class="vacio">Sin clases este día 🎉</p>'}
    </div>`;
  } else {
    cuerpo = dias
      .map((f) => {
        const cs = datos.clasesDelDia(f);
        return `<div class="tarjeta"><h2 class="mayus">${esc(fechaCorta(f))}</h2>${cs.length ? cs.map((c) => filaClase(c, f === hoy())).join('') : '<p class="suave pequeno">Sin clases</p>'}</div>`;
      })
      .join('');
  }

  contenido.innerHTML = `
    <div class="segmentos"><button data-modo-h="dia" class="${modoHorario === 'dia' ? 'activo' : ''}">Día</button><button data-modo-h="semana" class="${modoHorario === 'semana' ? 'activo' : ''}">Semana</button></div>
    <div class="semana-nav">
      <button class="boton-icono" id="sem-ant" aria-label="Semana anterior">‹</button>
      <b>${esc(rango)}</b>
      <button class="boton secundario" id="sem-hoy" style="min-height:36px">Hoy</button>
      <button class="boton-icono" id="sem-sig" aria-label="Semana siguiente">›</button>
    </div>
    ${modoHorario === 'dia' ? `<div class="dias">${dias.map((f, i) => {
      const hay = datos.clasesDelDia(f).some((c) => !c.cancelada);
      return `<button data-dia="${f}" class="${f === diaHorario ? 'activo' : ''} ${f === hoy() ? 'hoy' : ''}">${DIAS_CORTOS[i]}<b>${aDate(f).getDate()}</b><span class="punto ${hay ? '' : 'no'}"></span></button>`;
    }).join('')}</div>` : ''}
    ${cuerpo}
    <div class="fila-botones">
      <button class="boton" id="nueva-clase" style="flex:1">＋ Añadir clase</button>
      <button class="boton secundario" id="clase-extra" style="flex:1">＋ Clase solo un día</button>
    </div>
    ${E().horario.length ? '<button class="boton secundario ancho" id="ver-todas" style="margin-top:8px">📋 Ver y editar todas las clases</button>' : ''}
    <p class="suave pequeno">💡 Toca una clase para cambiarla <b>solo ese día</b> (por ejemplo, si toca laboratorio en vez de teoría o cambia el aula) o para editarla en todas las semanas.</p>`;

  for (const b of $$('[data-modo-h]')) b.onclick = () => ((modoHorario = b.dataset.modoH), vistaHorario());
  for (const b of $$('[data-dia]')) b.onclick = () => ((diaHorario = b.dataset.dia), vistaHorario());
  $('#sem-ant').onclick = () => ((diaHorario = sumarDias(diaHorario, -7)), vistaHorario());
  $('#sem-sig').onclick = () => ((diaHorario = sumarDias(diaHorario, 7)), vistaHorario());
  $('#sem-hoy').onclick = () => ((diaHorario = hoy()), vistaHorario());
  $('#nueva-clase').onclick = () => hojaFormClase();
  $('#clase-extra').onclick = () => hojaCambioDia({ fecha: diaHorario });
  if ($('#ver-todas')) $('#ver-todas').onclick = hojaTodasClases;
  enlazarClases(contenido);
}

function enlazarClases(raiz) {
  for (const el of $$('.clase[data-fecha]', raiz)) {
    el.onclick = () => hojaClase({ claseId: Number(el.dataset.clase) || null, cambioId: Number(el.dataset.cambio) || null, fecha: el.dataset.fecha });
  }
}

function hojaClase({ claseId, cambioId, fecha }) {
  const c = datos.clasesDelDia(fecha).find((x) => (claseId ? x.claseId === claseId : x.cambioId === cambioId));
  if (!c) return;
  const base = claseId ? E().horario.find((x) => x.id === claseId) : null;
  abrirHoja(
    `<h2>${ICONO_CLASE[c.tipo]} ${esc(c.asignatura)}</h2>
     <div class="tarjeta">
       <p class="mayus">🗓️ ${esc(fechaCorta(fecha))} · ${c.inicio}–${c.fin}</p>
       <p>🚪 ${c.aula ? esc(c.aula) : 'Sin aula'} · <span class="chip ${c.tipo}">${NOMBRE_CLASE[c.tipo]}</span></p>
       ${c.cancelada ? '<p><b>❌ Cancelada este día</b></p>' : ''}
       ${c.nota ? `<p>📝 ${esc(c.nota)}</p>` : ''}
       ${base ? `<p class="suave pequeno">Normalmente: cada ${DIAS_SEMANA[base.dia - 1]} ${base.inicio}–${base.fin}, ${NOMBRE_CLASE[base.tipo].toLowerCase()}${base.aula ? `, aula ${esc(base.aula)}` : ''}${base.notas ? ` · ${esc(base.notas)}` : ''}</p>` : '<p class="suave pequeno">Clase extra solo este día.</p>'}
     </div>
     ${base ? `<button class="boton ancho" id="cl-dia">✏️ Cambiar solo este día</button>` : ''}
     ${c.cambiada ? `<button class="boton secundario ancho" id="cl-quitar" style="margin-top:8px">${c.extra ? '🗑️ Borrar esta clase extra' : '↩️ Quitar el cambio de este día'}</button>` : ''}
     ${base ? `<div class="fila-botones">
       <button class="boton secundario" id="cl-editar" style="flex:1">Editar todas las semanas</button>
       <button class="boton peligro" id="cl-borrar" style="flex:1">🗑️ Quitar del horario</button>
     </div>` : ''}`,
    (h) => {
      if (base) {
        $('#cl-dia', h).onclick = () => hojaCambioDia({ fecha, clase: c });
        $('#cl-editar', h).onclick = () => hojaFormClase(base);
        $('#cl-borrar', h).onclick = async () => {
          if (!confirmar(`¿Quitar ${c.asignatura} de los ${DIAS_SEMANA[base.dia - 1]} ${base.inicio} de tu horario?`)) return;
          await datos.borrarClase(base.id);
          cerrarHoja();
          aviso('🗑️ Clase quitada');
          render();
        };
      }
      if ($('#cl-quitar', h)) {
        $('#cl-quitar', h).onclick = async () => {
          await datos.borrarCambioClase(c.cambioId);
          cerrarHoja();
          aviso('↩️ Hecho');
          render();
        };
      }
    },
  );
}

const opcionesTipoClase = (sel) => TIPOS_CLASE.map((t) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${ICONO_CLASE[t]} ${NOMBRE_CLASE[t]}</option>`).join('');

function hojaFormClase(c = null) {
  const asig = c ? E().asignaturas.find((a) => a.id === c.asignaturaId)?.nombre : '';
  abrirHoja(
    `<h2>${c ? 'Editar clase (todas las semanas)' : 'Añadir clase al horario'}</h2>
     <form id="f-clase">
       <label class="campo"><span>Asignatura</span><input name="asignatura" list="lista-asig" required value="${esc(asig || '')}" placeholder="Ej: Física II" autocomplete="off">${opcionesAsignaturas()}</label>
       <div class="campo"><span>${c ? 'Día' : 'Días (puedes marcar varios)'}</span>
         <div class="chip-dia">${DIAS_CORTOS.map((d, i) => `<label><input type="${c ? 'radio' : 'checkbox'}" name="dia" value="${i + 1}" ${c?.dia === i + 1 ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
       </div>
       <div class="dos-columnas">
         <label class="campo"><span>Empieza</span><input type="time" name="inicio" required value="${c?.inicio || '09:00'}"></label>
         <label class="campo"><span>Termina</span><input type="time" name="fin" required value="${c?.fin || '11:00'}"></label>
       </div>
       <div class="dos-columnas">
         <label class="campo"><span>Aula / nº de clase</span><input name="aula" value="${esc(c?.aula || '')}" placeholder="Ej: 2.3 o L1"></label>
         <label class="campo"><span>Tipo</span><select name="tipo">${opcionesTipoClase(c?.tipo || 'teoria')}</select></label>
       </div>
       <label class="campo"><span>Grupo (opcional)</span><input name="grupo" value="${esc(c?.grupo || '')}"></label>
       <div class="dos-columnas">
         <label class="campo"><span>Desde (opcional)</span><input type="date" name="desde" value="${c?.desde || ''}"></label>
         <label class="campo"><span>Hasta (opcional)</span><input type="date" name="hasta" value="${c?.hasta || ''}"></label>
       </div>
       <label class="campo"><span>Notas</span><input name="notas" value="${esc(c?.notas || '')}" placeholder="Ej: semanas alternas, profesor…"></label>
       <button class="boton ancho">Guardar</button>
     </form>`,
    (h) => {
      $('#f-clase', h).onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const f = Object.fromEntries(fd);
        const dias = fd.getAll('dia');
        if (!dias.length) return aviso('Elige al menos un día');
        try {
          const campos = { asignatura: f.asignatura, inicio: f.inicio, fin: f.fin, aula: f.aula, tipo: f.tipo, grupo: f.grupo, desde: f.desde || null, hasta: f.hasta || null, notas: f.notas };
          if (c) await datos.modificarClase({ id: c.id, dia: Number(dias[0]), ...campos });
          else await datos.crearClase({ ...campos, dias: dias.map(Number) });
          cerrarHoja();
          aviso('✓ Horario guardado');
          render();
        } catch (err) {
          aviso(err.message);
        }
      };
    },
  );
}

/** Cambiar una clase solo un día (o añadir una clase extra ese día si no se pasa `clase`). */
function hojaCambioDia({ fecha, clase = null }) {
  const cambio = clase?.cambioId ? E().cambiosClase.find((x) => x.id === clase.cambioId) : null;
  abrirHoja(
    `<h2>${clase ? `Cambio solo el ${esc(fechaCorta(fecha))}` : 'Clase solo un día'}</h2>
     <p class="suave pequeno">${clase ? `${esc(clase.asignatura)}. Las demás semanas no cambian.` : 'Para una clase que no está en tu horario habitual (recuperación, laboratorio suelto, tutoría…).'}</p>
     <form id="f-cambio">
       ${clase ? '' : `<label class="campo"><span>Asignatura</span><input name="asignatura" list="lista-asig" required autocomplete="off" placeholder="Ej: Química">${opcionesAsignaturas()}</label>
       <label class="campo"><span>Día</span><input type="date" name="fecha" required value="${fecha}"></label>`}
       <label class="campo"><span>Ese día toca</span><select name="tipo">${opcionesTipoClase(cambio?.tipo || clase?.tipo || 'laboratorio')}</select></label>
       <div class="dos-columnas">
         <label class="campo"><span>Empieza</span><input type="time" name="inicio" ${clase ? '' : 'required'} value="${clase?.inicio || ''}"></label>
         <label class="campo"><span>Termina</span><input type="time" name="fin" ${clase ? '' : 'required'} value="${clase?.fin || ''}"></label>
       </div>
       <label class="campo"><span>Aula / nº de clase</span><input name="aula" value="${esc(clase?.aula || '')}" placeholder="Ej: L2"></label>
       <label class="campo"><span>Nota</span><input name="nota" value="${esc(cambio?.nota || '')}" placeholder="Ej: traer bata, parcial en clase…"></label>
       ${clase ? `<label class="casilla"><input type="checkbox" name="cancelada" ${clase.cancelada ? 'checked' : ''}> <span>Se cancela este día</span></label>` : ''}
       <button class="boton ancho">Guardar</button>
     </form>`,
    (h) => {
      $('#f-cambio', h).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        try {
          const r = clase
            ? await datos.cambiarClaseDia({ clase_id: clase.claseId, fecha, tipo: f.tipo, inicio: f.inicio || undefined, fin: f.fin || undefined, aula: f.aula, nota: f.nota, cancelada: f.cancelada === 'on' })
            : await datos.cambiarClaseDia({ fecha: f.fecha, asignatura: f.asignatura, tipo: f.tipo, inicio: f.inicio, fin: f.fin, aula: f.aula, nota: f.nota });
          if (!r.ok) return aviso(r.error);
          if (!clase) diaHorario = f.fecha;
          cerrarHoja();
          aviso('✓ Guardado solo para ese día');
          render();
        } catch (err) {
          aviso(err.message);
        }
      };
    },
  );
}

function hojaTodasClases() {
  const lista = datos.verHorario();
  abrirHoja(
    `<h2>Todas las clases</h2>
     <div class="tarjeta">${lista.map((c) => `<div class="clase ${c.tipo}" data-editar-clase="${c.id}">
        <div class="horas mayus" style="width:70px">${DIAS_SEMANA[c.dia - 1].slice(0, 3)}<small>${c.inicio}–${c.fin}</small></div>
        <div class="barra"></div>
        <div class="cuerpo"><div class="titulo-el">${esc(c.asignatura)}</div><div class="detalle">${ICONO_CLASE[c.tipo]} ${NOMBRE_CLASE[c.tipo]}${c.aula ? ` · 🚪 ${esc(c.aula)}` : ''}${c.grupo ? ` · grupo ${esc(c.grupo)}` : ''}</div></div>
      </div>`).join('')}</div>`,
    (h) => {
      for (const el of $$('[data-editar-clase]', h)) el.onclick = () => hojaFormClase(E().horario.find((x) => x.id === Number(el.dataset.editarClase)));
    },
  );
}

// =====================================================================
// NOTAS
// =====================================================================

let filtroNotas = { texto: '', asignatura: '' };

function vistaNotas() {
  const asigs = [...new Set(E().notas.map((n) => E().asignaturas.find((a) => a.id === n.asignaturaId)?.nombre).filter(Boolean))].sort();
  contenido.innerHTML = `
    <div class="fila-botones" style="margin-top:0">
      <input class="buscador" id="buscar-notas" type="search" placeholder="🔍 Buscar en tus notas" value="${esc(filtroNotas.texto)}" style="flex:1">
      <button class="boton" id="nueva-nota">＋ Nota</button>
    </div>
    ${asigs.length ? `<div class="filtros"><button data-filtro="" class="${!filtroNotas.asignatura ? 'activo' : ''}">Todas</button>${asigs.map((a) => `<button data-filtro="${esc(a)}" class="${filtroNotas.asignatura === a ? 'activo' : ''}">${esc(a)}</button>`).join('')}</div>` : ''}
    <div id="lista-notas"></div>`;
  pintarNotas();
  const buscar = $('#buscar-notas');
  buscar.oninput = () => {
    filtroNotas.texto = buscar.value;
    pintarNotas();
  };
  for (const b of $$('[data-filtro]')) b.onclick = () => ((filtroNotas.asignatura = b.dataset.filtro), vistaNotas());
  $('#nueva-nota').onclick = () => hojaNota();
}

function pintarNotas() {
  const lista = datos.buscarNotas({ texto: filtroNotas.texto || undefined, asignatura: filtroNotas.asignatura || undefined });
  const cont = $('#lista-notas');
  if (!lista.length) {
    cont.innerHTML = `<div class="tarjeta"><p class="vacio">${E().notas.length ? 'No hay notas que coincidan.' : 'Aquí puedes apuntar lo que quieras: fórmulas, ideas, material que llevar, dudas para tutoría…<br><br>También puedes decírselo al Chat: <i>"apunta que…"</i>'}</p></div>`;
    return;
  }
  cont.innerHTML = `<div class="notas">${lista.map((n) => `<div class="nota" data-nota="${n.id}">
      <h4>${n.fijada ? '📌 ' : ''}${esc(n.titulo)}</h4>
      ${n.texto && n.texto !== n.titulo ? `<p>${esc(n.texto)}</p>` : ''}
      <div class="pie">${n.asignatura ? `${esc(n.asignatura)} · ` : ''}${esc(fechaCorta(n.editado))}</div>
    </div>`).join('')}</div>`;
  for (const el of $$('[data-nota]', cont)) el.onclick = () => hojaNota(E().notas.find((x) => x.id === Number(el.dataset.nota)));
}

function hojaNota(n = null) {
  const asig = n ? E().asignaturas.find((a) => a.id === n.asignaturaId)?.nombre || '' : filtroNotas.asignatura;
  abrirHoja(
    `<form id="f-nota" class="editor-nota">
       <label class="campo" style="margin-top:4px"><span>Título</span><input name="titulo" value="${esc(n?.titulo || '')}" placeholder="Título (opcional)"></label>
       <label class="campo"><span>Nota</span><textarea name="texto" placeholder="Escribe aquí…">${esc(n?.texto || '')}</textarea></label>
       <label class="campo"><span>Asignatura (opcional)</span><input name="asignatura" list="lista-asig" value="${esc(asig)}" autocomplete="off">${opcionesAsignaturas()}</label>
       <label class="casilla"><input type="checkbox" name="fijada" ${n?.fijada ? 'checked' : ''}> <span>📌 Fijar arriba</span></label>
       <div class="fila-botones">
         <button class="boton" style="flex:2">Guardar</button>
         ${n ? '<button type="button" class="boton peligro" id="borrar-nota" style="flex:1">🗑️</button>' : ''}
       </div>
     </form>`,
    (h) => {
      if (!n) setTimeout(() => $('textarea', h).focus(), 150);
      $('#f-nota', h).onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        try {
          const campos = { titulo: f.titulo, texto: f.texto, asignatura: f.asignatura || null, fijada: f.fijada === 'on' };
          if (n) await datos.modificarNota({ id: n.id, ...campos });
          else await datos.crearNota(campos);
          cerrarHoja();
          aviso('✓ Nota guardada');
          render();
        } catch (err) {
          aviso(err.message);
        }
      };
      if ($('#borrar-nota', h)) {
        $('#borrar-nota', h).onclick = async () => {
          if (!confirmar(`¿Borrar la nota "${n.titulo}"?`)) return;
          await datos.borrarNota(n.id);
          cerrarHoja();
          render();
        };
      }
    },
  );
}

// =====================================================================
// MÁS
// =====================================================================

function vistaMas() {
  contenido.innerHTML = `
    <div class="mosaico">
      <a href="#notas"><span class="grande">📝</span><b>Notas</b><span class="suave">${E().notas.length} notas</span></a>
      <a href="#anadir"><span class="grande">➕</span><b>Añadir información</b><span class="suave">Texto, web, archivos e imágenes</span></a>
      <a href="#agenda" id="ir-asig"><span class="grande">🎓</span><b>Asignaturas</b><span class="suave">${E().asignaturas.length} asignaturas</span></a>
      <a href="#ajustes"><span class="grande">⚙️</span><b>Ajustes</b><span class="suave">IA, tema, avisos, copias</span></a>
    </div>`;
  $('#ir-asig').onclick = () => (seccionAgenda = 'asignaturas');
}

// =====================================================================
// TEMA (claro / oscuro)
// =====================================================================

function aplicarTema(tema = E().ajustes.tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'oscuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  try {
    localStorage.setItem('tema', tema || 'auto');
  } catch {}
  const oscuro = tema === 'oscuro' || (tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = oscuro ? '#0c0e0d' : '#0f6b53';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema());

// =====================================================================
// AJUSTES
// =====================================================================

function vistaAjustes() {
  const a = E().ajustes;
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  contenido.innerHTML = `
    ${instalada ? '' : `<div class="tarjeta destacada"><h2>📲 Instálala en el móvil</h2>${esIOS
      ? '<p>En Safari, toca <b>Compartir</b> (el cuadrado con la flecha ↑) y luego <b>Añadir a pantalla de inicio</b>.</p>'
      : '<p>En Chrome, toca el menú <b>⋮</b> y luego <b>Instalar aplicación</b> (o "Añadir a pantalla de inicio").</p>'}</div>`}

    <div class="tarjeta">
      <h2>🎨 Apariencia</h2>
      <div class="segmentos" id="temas">
        ${[['auto', '📱 Automático'], ['claro', '☀️ Claro'], ['oscuro', '🌙 Oscuro']].map(([v, t]) => `<button data-tema="${v}" class="${(a.tema || 'auto') === v ? 'activo' : ''}">${t}</button>`).join('')}
      </div>
      <p class="suave pequeno">Automático sigue el modo claro/oscuro de tu móvil.</p>
    </div>

    <form class="tarjeta" id="f-ia">
      <h2>🤖 Inteligencia artificial</h2>
      <p class="suave pequeno">La IA es gratuita (Google Gemini). Consigue tu clave en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → <b>Create API key</b>, cópiala y pégala aquí. Se guarda solo en este móvil.</p>
      <label class="campo"><span>Clave de IA</span><input name="apiKey" type="password" autocomplete="off" value="${esc(a.apiKey)}" placeholder="AIza…"></label>
      <label class="campo"><span>Modelo</span><input name="modelo" value="${esc(a.modelo)}"></label>
      <div class="fila-botones"><button type="button" class="boton" id="probar" style="flex:2">Guardar y probar</button><button class="boton secundario" style="flex:1">Solo guardar</button></div>
      <div id="estado-ia"></div>
    </form>

    <form class="tarjeta" id="f-avisos">
      <h2>⏰ Avisos de exámenes y entregas</h2>
      <div class="dos-columnas">
        <label class="campo"><span>Días antes</span><input name="dias" value="${esc(a.avisosDias.join(', '))}" inputmode="numeric"></label>
        <label class="campo"><span>A qué hora</span><input name="hora" type="time" value="${esc(a.avisosHora)}"></label>
      </div>
      <button class="boton ancho">Guardar</button>
      <p class="suave pequeno">La app muestra los avisos al abrirla. Para que suenen con la app cerrada, en Agenda → Eventos toca <b>📅 Todo al calendario</b> (vuelve a hacerlo cuando añadas fechas nuevas).</p>
    </form>

    <div class="tarjeta">
      <h2>💾 Copia de seguridad</h2>
      <p class="suave pequeno">Tus datos se guardan solo en este móvil. Haz una copia de vez en cuando (por ejemplo, guárdala en Drive o iCloud). También sirve para pasar los datos a otro móvil.</p>
      <div class="fila-botones">
        <button class="boton secundario" id="exportar" style="flex:1">⬇️ Hacer copia</button>
        <button class="boton secundario" id="importar" style="flex:1">⬆️ Restaurar copia</button>
      </div>
    </div>

    <div class="tarjeta">
      <h2>🧹 Borrar</h2>
      <div class="fila-botones">
        <button class="boton secundario" id="borrar-chat" style="flex:1">Borrar conversación</button>
        <button class="boton peligro" id="borrar-todo" style="flex:1">Borrar todo</button>
      </div>
    </div>
    <p class="suave pequeno" style="text-align:center">Asistente Uni · tus datos no salen del móvil salvo lo que envías a la IA para que te responda.</p>`;

  for (const b of $$('[data-tema]')) {
    b.onclick = async () => {
      a.tema = b.dataset.tema;
      aplicarTema(a.tema);
      await almacen.guardar();
      vistaAjustes();
    };
  }
  $('#f-ia').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    a.apiKey = String(f.get('apiKey')).replace(/\s+/g, '');
    a.modelo = String(f.get('modelo')).trim() || 'gemini-3.8-flash';
    await almacen.guardar();
    aviso('✓ Guardado. Pulsa "Probar" para comprobar que funciona.');
  };
  $('#probar').onclick = async () => {
    const boton = $('#probar');
    const estado = $('#estado-ia');
    const f = new FormData($('#f-ia'));
    // La clave se guarda siempre (aunque la prueba falle), quitando espacios y saltos de línea al pegar
    a.apiKey = String(f.get('apiKey')).replace(/\s+/g, '');
    a.modelo = String(f.get('modelo')).trim() || 'gemini-3.8-flash';
    await almacen.guardar();
    boton.disabled = true;
    estado.innerHTML = '<p class="suave">Probando…</p>';
    try {
      const modelo = await probarClave(a);
      await almacen.guardar();
      $('#f-ia').modelo.value = modelo;
      estado.innerHTML = `<div class="tarjeta destacada">✅ <b>¡Funciona!</b> Clave guardada. Modelo: ${esc(modelo)}</div>`;
    } catch (err) {
      estado.innerHTML = `<div class="tarjeta alerta">❌ ${esc(err.message)}</div>`;
    }
    boton.disabled = false;
  };
  $('#f-avisos').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const dias = String(f.get('dias')).split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 120);
    if (!dias.length) return aviso('Pon al menos un número de días, por ejemplo: 7, 3, 1');
    a.avisosDias = [...new Set(dias)].sort((x, y) => y - x);
    a.avisosHora = f.get('hora') || '09:00';
    await almacen.guardar();
    aviso('✓ Guardado');
    vistaAjustes();
  };
  $('#exportar').onclick = async () => {
    const copia = structuredClone(E());
    copia.ajustes.apiKey = ''; // la clave no va en la copia
    const file = new File([JSON.stringify(copia, null, 2)], `asistente-uni-copia-${hoy()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        return await navigator.share({ files: [file], title: 'Copia de Asistente Uni' });
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const el = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(el);
    el.click();
    el.remove();
  };
  $('#importar').onclick = async () => {
    const f = await elegirArchivo('application/json,.json');
    if (!f) return;
    try {
      const nuevo = JSON.parse(await f.text());
      if (!Array.isArray(nuevo.eventos) || !nuevo.ajustes) throw new Error('Ese archivo no es una copia de Asistente Uni');
      if (!confirmar(`¿Restaurar la copia? Se sustituirán tus datos actuales por los de la copia (${nuevo.eventos.length} eventos, ${nuevo.asignaturas?.length || 0} asignaturas).`)) return;
      nuevo.ajustes.apiKey ||= a.apiKey;
      await almacen.reemplazar(nuevo);
      aplicarTema();
      aviso('✓ Copia restaurada');
      render();
    } catch (err) {
      aviso(err.message);
    }
  };
  $('#borrar-chat').onclick = async () => {
    if (!confirmar('¿Borrar la conversación del chat? Tus datos se mantienen.')) return;
    E().historial = [];
    await almacen.guardar();
    aviso('🧹 Conversación borrada');
  };
  $('#borrar-todo').onclick = async () => {
    if (!confirmar('¿Borrar TODOS tus datos (asignaturas, fechas, memoria, documentos)? Haz antes una copia. No se puede deshacer.')) return;
    const clave = a.apiKey;
    await almacen.reemplazar({ ajustes: { apiKey: clave } });
    aviso('🗑️ Todo borrado');
    render();
  };
}

// =====================================================================
// Avisos mientras la app está abierta
// =====================================================================

const yaAvisados = new Set();
function revisarAvisos() {
  const vencidos = datos.verRecordatorios({ solo_vencidos: true });
  for (const r of vencidos) {
    if (yaAvisados.has(r.id)) continue;
    yaAvisados.add(r.id);
    if (document.visibilityState === 'visible') aviso(r.texto, 6000);
  }
  actualizarGlobo();
  if (vistaActual === 'hoy' && vencidos.some((r) => !$(`[data-hecho="${r.id}"]`))) vistaHoy();
}
setInterval(revisarAvisos, 30000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && (render(), revisarAvisos()));

// ---------- arranque ----------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo sin conexión:', e));
}
aplicarTema();
render();
revisarAvisos();
