// Todas las operaciones sobre tus datos. Las usan tanto las pantallas como la IA.
import { ahora, hoy, normalizar, sumarDias, tieneHora, aDate, aTexto, bonito, diasHasta } from './fechas.js';

export const TIPOS_EVENTO = ['examen', 'examen_laboratorio', 'practica', 'entrega', 'clase', 'otro'];
export const TIPOS_CON_AVISO = new Set(['examen', 'examen_laboratorio', 'entrega']);
export const NOMBRE_TIPO = {
  examen: 'Examen',
  examen_laboratorio: 'Examen de laboratorio',
  practica: 'Práctica',
  entrega: 'Entrega',
  clase: 'Clase',
  otro: 'Otro',
};
export const TIPOS_CLASE = ['teoria', 'laboratorio', 'practicas', 'seminario', 'otro'];
export const NOMBRE_CLASE = { teoria: 'Teoría', laboratorio: 'Laboratorio', practicas: 'Prácticas', seminario: 'Seminario', otro: 'Otro' };
export const ICONO_CLASE = { teoria: '📖', laboratorio: '🧪', practicas: '💻', seminario: '👥', otro: '📌' };
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const ICONO_TIPO = { examen: '📝', examen_laboratorio: '🧪', practica: '🔬', entrega: '📤', clase: '📚', otro: '📌' };

const limpio = (x) => (x === undefined || x === null || x === '' ? null : x);

export function validarFecha(texto, campo = 'fecha') {
  const n = normalizar(texto);
  if (!n) throw new Error(`La ${campo} no es válida (${texto}). Usa formato YYYY-MM-DD o YYYY-MM-DDTHH:MM.`);
  return n;
}

export function crearDatos(almacen) {
  const e = () => almacen.estado;
  const guardar = () => almacen.guardar();

  // ---------- asignaturas ----------

  function buscarAsignatura(nombre) {
    if (!nombre) return null;
    const n = nombre.trim().toLowerCase();
    const lista = e().asignaturas;
    return lista.find((a) => a.nombre.toLowerCase() === n) || (() => {
      const parecidas = lista.filter((a) => a.nombre.toLowerCase().includes(n) || n.includes(a.nombre.toLowerCase()));
      return parecidas.length === 1 ? parecidas[0] : null;
    })();
  }

  function asignaturaOCrear(nombre) {
    if (!nombre || !nombre.trim()) return null;
    let a = buscarAsignatura(nombre);
    if (!a) {
      a = { id: almacen.nuevoId(), nombre: nombre.trim(), curso: null, cuatrimestre: null, profesor: null, examen_final_lab: null, info: null };
      e().asignaturas.push(a);
    }
    return a;
  }

  const nombreAsig = (id) => e().asignaturas.find((a) => a.id === id)?.nombre || null;
  const conAsig = (ev) => ({ ...ev, asignatura: nombreAsig(ev.asignaturaId) });
  const ordenar = (lista) => lista.sort((a, b) => a.inicio.localeCompare(b.inicio));

  async function guardarAsignatura(a) {
    if (!a.nombre?.trim()) throw new Error('Falta el nombre de la asignatura');
    const asig = asignaturaOCrear(a.nombre);
    if (a.nombre_nuevo) asig.nombre = a.nombre_nuevo.trim();
    for (const campo of ['curso', 'cuatrimestre', 'profesor']) if (a[campo] !== undefined) asig[campo] = limpio(a[campo]);
    if (a.tiene_examen_final_laboratorio !== undefined) asig.examen_final_lab = a.tiene_examen_final_laboratorio;
    if (a.info !== undefined) asig.info = a.anadir_info && asig.info ? `${asig.info}\n${a.info}` : limpio(a.info);
    await guardar();
    return { ok: true, asignatura: asig };
  }

  function verAsignaturas(nombre) {
    let lista = [...e().asignaturas].sort((x, y) => x.nombre.localeCompare(y.nombre));
    if (nombre) lista = lista.filter((x) => x.nombre.toLowerCase().includes(nombre.toLowerCase()));
    return lista.map((a) => ({ ...a, eventos: ordenar(e().eventos.filter((ev) => ev.asignaturaId === a.id)) }));
  }

  async function borrarAsignatura(nombreOId) {
    const a = typeof nombreOId === 'number' ? e().asignaturas.find((x) => x.id === nombreOId) : buscarAsignatura(nombreOId);
    if (!a) return { ok: false, error: `No encuentro la asignatura "${nombreOId}"` };
    const idsEv = new Set(e().eventos.filter((ev) => ev.asignaturaId === a.id).map((ev) => ev.id));
    e().eventos = e().eventos.filter((ev) => !idsEv.has(ev.id));
    const idsClases = new Set(e().horario.filter((c) => c.asignaturaId === a.id).map((c) => c.id));
    e().horario = e().horario.filter((c) => !idsClases.has(c.id));
    e().cambiosClase = e().cambiosClase.filter((c) => !idsClases.has(c.horarioId) && c.asignaturaId !== a.id);
    for (const n of e().notas) if (n.asignaturaId === a.id) n.asignaturaId = null;
    e().asignaturas = e().asignaturas.filter((x) => x.id !== a.id);
    await guardar();
    return { ok: true, eventos_borrados: idsEv.size };
  }

  // ---------- eventos ----------

  async function crearEvento(a) {
    const tipo = TIPOS_EVENTO.includes(a.tipo) ? a.tipo : 'otro';
    if (!a.titulo?.trim()) throw new Error('Falta el título del evento');
    const inicio = validarFecha(a.inicio, 'fecha de inicio');
    const fin = a.fin ? validarFecha(a.fin, 'fecha de fin') : null;
    const asig = asignaturaOCrear(a.asignatura);
    const hasta = a.repetir_semanal_hasta ? validarFecha(a.repetir_semanal_hasta, 'fecha de repetición').slice(0, 10) : null;

    const fechas = [[inicio, fin]];
    if (hasta) {
      let [i, f] = [inicio, fin];
      for (let n = 0; n < 60; n++) {
        i = sumarDias(i, 7);
        f = f ? sumarDias(f, 7) : null;
        if (i.slice(0, 10) > hasta) break;
        fechas.push([i, f]);
      }
    }
    const creados = fechas.map(([i, f]) => {
      const ev = { id: almacen.nuevoId(), asignaturaId: asig?.id ?? null, tipo, titulo: a.titulo.trim(), inicio: i, fin: f, lugar: limpio(a.lugar), notas: limpio(a.notas) };
      e().eventos.push(ev);
      return ev;
    });
    await guardar();
    return { ok: true, asignatura: asig?.nombre ?? null, creados: creados.map((c) => ({ id: c.id, inicio: c.inicio })), avisos_automaticos: TIPOS_CON_AVISO.has(tipo) };
  }

  function buscarEventos(a = {}) {
    let lista = e().eventos.map(conAsig);
    if (a.asignatura) lista = lista.filter((x) => x.asignatura?.toLowerCase().includes(a.asignatura.toLowerCase()));
    if (a.tipo) lista = lista.filter((x) => x.tipo === a.tipo);
    if (a.desde) {
      const d = validarFecha(a.desde, 'fecha "desde"');
      lista = lista.filter((x) => x.inicio >= d);
    }
    if (a.hasta) {
      const h = validarFecha(a.hasta, 'fecha "hasta"').slice(0, 10);
      lista = lista.filter((x) => x.inicio.slice(0, 10) <= h);
    }
    if (a.texto) {
      const t = a.texto.toLowerCase();
      lista = lista.filter((x) => [x.titulo, x.notas, x.lugar].some((c) => c?.toLowerCase().includes(t)));
    }
    return ordenar(lista).slice(0, 200);
  }

  async function modificarEvento(a) {
    const ev = e().eventos.find((x) => x.id === Number(a.id));
    if (!ev) return { ok: false, error: `No existe el evento ${a.id}` };
    if (a.asignatura !== undefined) ev.asignaturaId = asignaturaOCrear(a.asignatura)?.id ?? null;
    if (TIPOS_EVENTO.includes(a.tipo)) ev.tipo = a.tipo;
    if (a.titulo) ev.titulo = a.titulo.trim();
    if (a.inicio) ev.inicio = validarFecha(a.inicio, 'fecha de inicio');
    if (a.fin !== undefined) ev.fin = a.fin ? validarFecha(a.fin, 'fecha de fin') : null;
    if (a.lugar !== undefined) ev.lugar = limpio(a.lugar);
    if (a.notas !== undefined) ev.notas = limpio(a.notas);
    await guardar();
    return { ok: true, evento: conAsig(ev) };
  }

  async function borrarEvento(id) {
    const ev = e().eventos.find((x) => x.id === Number(id));
    if (!ev) return { ok: false, error: `No existe el evento ${id}` };
    e().eventos = e().eventos.filter((x) => x.id !== ev.id);
    await guardar();
    return { ok: true, borrado: conAsig(ev) };
  }

  const eventosEntre = (desde, hasta) => ordenar(e().eventos.filter((x) => x.inicio.slice(0, 10) >= desde && x.inicio.slice(0, 10) <= hasta).map(conAsig));

  // ---------- recordatorios ----------

  /** Avisos automáticos (p. ej. 7, 3 y 1 día antes) de exámenes y entregas. Se calculan, no se guardan. */
  function avisosAutomaticos() {
    const { avisosDias, avisosHora } = e().ajustes;
    const vistos = new Set(e().avisosVistos);
    const lista = [];
    for (const ev of e().eventos) {
      if (!TIPOS_CON_AVISO.has(ev.tipo)) continue;
      const asig = nombreAsig(ev.asignaturaId);
      const quien = asig ? `${NOMBRE_TIPO[ev.tipo]} de ${asig}` : NOMBRE_TIPO[ev.tipo];
      const hora = tieneHora(ev.inicio) ? ` a las ${ev.inicio.slice(11)}` : '';
      const lugar = ev.lugar ? ` (${ev.lugar})` : '';
      for (const dias of avisosDias) {
        const id = `auto-${ev.id}-${dias}`;
        if (vistos.has(id)) continue;
        lista.push({
          id,
          automatico: true,
          eventoId: ev.id,
          cuando: `${sumarDias(ev.inicio.slice(0, 10), -dias)}T${avisosHora}`,
          texto: `⏰ ${quien}: ${ev.titulo} — ${dias === 1 ? 'es MAÑANA' : `en ${dias} días`}${hora}${lugar}.`,
        });
      }
    }
    return lista;
  }

  async function crearRecordatorio({ texto, cuando, repetir }) {
    if (!texto?.trim()) throw new Error('Falta el texto del recordatorio');
    let c = validarFecha(cuando, 'fecha del recordatorio');
    if (!tieneHora(c)) c = `${c}T09:00`;
    if (c <= ahora()) return { ok: false, error: `Esa hora (${c}) ya ha pasado. Ahora son las ${ahora()}.` };
    const rep = ['diario', 'semanal', 'mensual'].includes(repetir) ? repetir : null;
    const r = { id: almacen.nuevoId(), texto: texto.trim(), cuando: c, repetir: rep, hecho: false };
    e().recordatorios.push(r);
    await guardar();
    return { ok: true, id: r.id, cuando: c, repetir: rep };
  }

  /** Pendientes = los tuyos sin completar + avisos automáticos futuros o vencidos sin marcar. */
  function verRecordatorios({ incluir_automaticos = true, solo_vencidos = false } = {}) {
    const limiteAuto = sumarDias(hoy(), -2); // los avisos automáticos de hace más de 2 días ya no se muestran
    let lista = e().recordatorios.filter((r) => !r.hecho);
    if (incluir_automaticos) lista = lista.concat(avisosAutomaticos().filter((a) => a.cuando.slice(0, 10) >= limiteAuto));
    if (solo_vencidos) lista = lista.filter((r) => r.cuando <= ahora());
    return lista.sort((a, b) => a.cuando.localeCompare(b.cuando));
  }

  function siguiente(cuando, repetir) {
    const d = aDate(cuando);
    const limite = ahora();
    do {
      if (repetir === 'diario') d.setDate(d.getDate() + 1);
      else if (repetir === 'semanal') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
    } while (aTexto(d) <= limite);
    return aTexto(d);
  }

  /** Marca un recordatorio como hecho (los repetitivos pasan a la siguiente fecha). */
  async function completarRecordatorio(id) {
    if (String(id).startsWith('auto-')) {
      if (!e().avisosVistos.includes(id)) e().avisosVistos.push(id);
    } else {
      const r = e().recordatorios.find((x) => x.id === Number(id));
      if (!r) return { ok: false };
      if (r.repetir) r.cuando = siguiente(r.cuando, r.repetir);
      else r.hecho = true;
    }
    await guardar();
    return { ok: true };
  }

  async function borrarRecordatorio(id) {
    if (String(id).startsWith('auto-')) return completarRecordatorio(id);
    const antes = e().recordatorios.length;
    e().recordatorios = e().recordatorios.filter((x) => x.id !== Number(id));
    await guardar();
    return { ok: e().recordatorios.length < antes };
  }

  // ---------- memoria ----------

  async function memorizar({ texto, etiquetas }) {
    if (!texto?.trim()) throw new Error('No hay nada que memorizar');
    const m = { id: almacen.nuevoId(), texto: texto.trim(), etiquetas: limpio(etiquetas), creado: ahora() };
    e().memoria.push(m);
    await guardar();
    return { ok: true, id: m.id };
  }

  function buscarMemoria(texto) {
    const lista = e().memoria;
    if (!texto) return lista;
    const palabras = texto.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    if (!palabras.length) return lista;
    return lista.filter((m) => palabras.some((p) => `${m.texto} ${m.etiquetas || ''}`.toLowerCase().includes(p)));
  }

  async function modificarMemoria({ id, texto, etiquetas }) {
    const m = e().memoria.find((x) => x.id === Number(id));
    if (!m) return { ok: false, error: `No existe el dato ${id}` };
    if (texto) m.texto = texto.trim();
    if (etiquetas !== undefined) m.etiquetas = limpio(etiquetas);
    await guardar();
    return { ok: true };
  }

  async function olvidar(id) {
    const antes = e().memoria.length;
    e().memoria = e().memoria.filter((x) => x.id !== Number(id));
    await guardar();
    return { ok: e().memoria.length < antes };
  }

  // ---------- conocimiento (documentos, webs, imágenes, textos que le añades) ----------

  async function anadirConocimiento({ titulo, tipo, origen, contenido }) {
    const d = { id: almacen.nuevoId(), titulo: (titulo || 'Sin título').trim().slice(0, 120), tipo, origen: limpio(origen), contenido: contenido || '', creado: ahora() };
    e().conocimiento.push(d);
    await guardar();
    return d;
  }

  function leerDocumento(id) {
    const d = e().conocimiento.find((x) => x.id === Number(id));
    return d ? { ok: true, ...d } : { ok: false, error: `No existe el documento ${id}` };
  }

  function buscarEnDocumentos(texto) {
    const t = (texto || '').toLowerCase();
    const res = [];
    for (const d of e().conocimiento) {
      const c = d.contenido.toLowerCase();
      let i = c.indexOf(t);
      let n = 0;
      while (i !== -1 && n < 5) {
        res.push({ documento: d.id, titulo: d.titulo, fragmento: d.contenido.slice(Math.max(0, i - 300), i + 500) });
        i = c.indexOf(t, i + t.length);
        n++;
      }
    }
    return res.slice(0, 20);
  }

  async function borrarConocimiento(id) {
    e().conocimiento = e().conocimiento.filter((x) => x.id !== Number(id));
    await guardar();
    return { ok: true };
  }

  // ---------- horario de clases ----------

  function validarHora(h, campo = 'hora') {
    const m = String(h ?? '').trim().match(/^(\d{1,2})[:.h](\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`La ${campo} no es válida (${h}). Usa formato HH:MM.`);
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  function validarDia(d) {
    if (typeof d === 'number' || /^\d$/.test(String(d))) {
      const n = Number(d);
      if (n >= 1 && n <= 7) return n;
    }
    const t = String(d ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const letra = { l: 1, m: 2, x: 3, j: 4, v: 5, s: 6, d: 7 }[t];
    if (letra) return letra;
    const i = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].findIndex((x) => x.startsWith(t.slice(0, 2)) && t.length >= 2);
    if (i === -1) throw new Error(`El día no es válido (${d}). Usa lunes, martes... o 1-7.`);
    return i + 1;
  }

  const diaDeFecha = (fecha) => {
    const d = aDate(fecha).getDay();
    return d === 0 ? 7 : d;
  };
  const tipoClase = (t) => (TIPOS_CLASE.includes(t) ? t : 'teoria');

  async function crearClase(a) {
    const asig = asignaturaOCrear(a.asignatura);
    if (!asig) throw new Error('Falta la asignatura de la clase');
    const dias = (Array.isArray(a.dias) ? a.dias : [a.dia ?? a.dias]).map(validarDia);
    const inicio = validarHora(a.inicio, 'hora de inicio');
    const fin = validarHora(a.fin, 'hora de fin');
    if (fin <= inicio) throw new Error('La hora de fin tiene que ser después de la de inicio');
    const creadas = [];
    for (const dia of [...new Set(dias)]) {
      const c = {
        id: almacen.nuevoId(), asignaturaId: asig.id, dia, inicio, fin, aula: limpio(a.aula), tipo: tipoClase(a.tipo),
        grupo: limpio(a.grupo), desde: a.desde ? validarFecha(a.desde).slice(0, 10) : null, hasta: a.hasta ? validarFecha(a.hasta).slice(0, 10) : null,
        notas: limpio(a.notas),
      };
      e().horario.push(c);
      creadas.push(c.id);
    }
    await guardar();
    return { ok: true, asignatura: asig.nombre, ids: creadas };
  }

  function verHorario() {
    return e().horario
      .map((c) => ({ ...c, asignatura: nombreAsig(c.asignaturaId), dia_nombre: DIAS_SEMANA[c.dia - 1] }))
      .sort((x, y) => x.dia - y.dia || x.inicio.localeCompare(y.inicio));
  }

  async function modificarClase(a) {
    const c = e().horario.find((x) => x.id === Number(a.id));
    if (!c) return { ok: false, error: `No existe la clase ${a.id}` };
    if (a.asignatura) c.asignaturaId = asignaturaOCrear(a.asignatura).id;
    if (a.dia !== undefined) c.dia = validarDia(a.dia);
    if (a.inicio) c.inicio = validarHora(a.inicio, 'hora de inicio');
    if (a.fin) c.fin = validarHora(a.fin, 'hora de fin');
    if (a.aula !== undefined) c.aula = limpio(a.aula);
    if (a.tipo) c.tipo = tipoClase(a.tipo);
    if (a.grupo !== undefined) c.grupo = limpio(a.grupo);
    if (a.desde !== undefined) c.desde = a.desde ? validarFecha(a.desde).slice(0, 10) : null;
    if (a.hasta !== undefined) c.hasta = a.hasta ? validarFecha(a.hasta).slice(0, 10) : null;
    if (a.notas !== undefined) c.notas = limpio(a.notas);
    await guardar();
    return { ok: true, clase: { ...c, asignatura: nombreAsig(c.asignaturaId) } };
  }

  async function borrarClase(id) {
    const antes = e().horario.length;
    e().horario = e().horario.filter((x) => x.id !== Number(id));
    e().cambiosClase = e().cambiosClase.filter((x) => x.horarioId !== Number(id));
    await guardar();
    return { ok: e().horario.length < antes };
  }

  /**
   * Cambio para un día concreto: con clase_id cambia esa clase solo ese día (tipo, aula, horas, cancelada);
   * sin clase_id añade una clase extra ese día.
   */
  async function cambiarClaseDia(a) {
    const fecha = validarFecha(a.fecha).slice(0, 10);
    if (a.clase_id) {
      const c = e().horario.find((x) => x.id === Number(a.clase_id));
      if (!c) return { ok: false, error: `No existe la clase ${a.clase_id}` };
      if (diaDeFecha(fecha) !== c.dia) return { ok: false, error: `El ${bonito(fecha)} no es ${DIAS_SEMANA[c.dia - 1]}, que es cuando hay esa clase` };
      let cambio = e().cambiosClase.find((x) => x.horarioId === c.id && x.fecha === fecha);
      if (!cambio) {
        cambio = { id: almacen.nuevoId(), horarioId: c.id, fecha };
        e().cambiosClase.push(cambio);
      }
      if (a.tipo) cambio.tipo = tipoClase(a.tipo);
      if (a.aula !== undefined) cambio.aula = limpio(a.aula);
      if (a.inicio) cambio.inicio = validarHora(a.inicio, 'hora de inicio');
      if (a.fin) cambio.fin = validarHora(a.fin, 'hora de fin');
      if (a.cancelada !== undefined) cambio.cancelada = Boolean(a.cancelada);
      if (a.nota !== undefined) cambio.nota = limpio(a.nota);
      await guardar();
      return { ok: true, cambio_id: cambio.id };
    }
    const asig = asignaturaOCrear(a.asignatura);
    if (!asig) throw new Error('Para una clase extra hace falta la asignatura');
    const extra = {
      id: almacen.nuevoId(), horarioId: null, fecha, asignaturaId: asig.id, tipo: tipoClase(a.tipo),
      inicio: validarHora(a.inicio, 'hora de inicio'), fin: validarHora(a.fin, 'hora de fin'), aula: limpio(a.aula), nota: limpio(a.nota), cancelada: false,
    };
    e().cambiosClase.push(extra);
    await guardar();
    return { ok: true, cambio_id: extra.id, extra: true };
  }

  async function borrarCambioClase(id) {
    const antes = e().cambiosClase.length;
    e().cambiosClase = e().cambiosClase.filter((x) => x.id !== Number(id));
    await guardar();
    return { ok: e().cambiosClase.length < antes };
  }

  /** Clases de una fecha, con los cambios de ese día ya aplicados. */
  function clasesDelDia(fecha) {
    const dia = diaDeFecha(fecha);
    const cambios = e().cambiosClase.filter((x) => x.fecha === fecha);
    const lista = e().horario
      .filter((c) => c.dia === dia && (!c.desde || c.desde <= fecha) && (!c.hasta || c.hasta >= fecha))
      .map((c) => {
        const cb = cambios.find((x) => x.horarioId === c.id);
        return {
          claseId: c.id, cambioId: cb?.id ?? null, fecha, asignatura: nombreAsig(c.asignaturaId),
          inicio: cb?.inicio || c.inicio, fin: cb?.fin || c.fin, aula: cb?.aula ?? c.aula, tipo: cb?.tipo || c.tipo, grupo: c.grupo,
          cancelada: Boolean(cb?.cancelada), nota: cb?.nota || null, notasClase: c.notas, cambiada: Boolean(cb), extra: false,
        };
      });
    for (const x of cambios.filter((c) => c.horarioId === null)) {
      lista.push({ claseId: null, cambioId: x.id, fecha, asignatura: nombreAsig(x.asignaturaId), inicio: x.inicio, fin: x.fin, aula: x.aula, tipo: x.tipo, cancelada: false, nota: x.nota, cambiada: true, extra: true });
    }
    return lista.sort((x, y) => x.inicio.localeCompare(y.inicio));
  }

  // ---------- notas ----------

  async function crearNota({ titulo, texto, asignatura, fijada }) {
    if (!titulo?.trim() && !texto?.trim()) throw new Error('La nota está vacía');
    const n = {
      id: almacen.nuevoId(), titulo: (titulo || '').trim() || texto.trim().split('\n')[0].slice(0, 60), texto: (texto || '').trim(),
      asignaturaId: asignatura ? asignaturaOCrear(asignatura).id : null, fijada: Boolean(fijada), creado: ahora(), editado: ahora(),
    };
    e().notas.push(n);
    await guardar();
    return { ok: true, id: n.id };
  }

  async function modificarNota(a) {
    const n = e().notas.find((x) => x.id === Number(a.id));
    if (!n) return { ok: false, error: `No existe la nota ${a.id}` };
    if (a.titulo !== undefined) n.titulo = a.titulo.trim() || n.titulo;
    if (a.texto !== undefined) n.texto = a.anadir && n.texto ? `${n.texto}\n${a.texto.trim()}` : a.texto.trim();
    if (a.asignatura !== undefined) n.asignaturaId = a.asignatura ? asignaturaOCrear(a.asignatura).id : null;
    if (a.fijada !== undefined) n.fijada = Boolean(a.fijada);
    n.editado = ahora();
    await guardar();
    return { ok: true };
  }

  async function borrarNota(id) {
    const antes = e().notas.length;
    e().notas = e().notas.filter((x) => x.id !== Number(id));
    await guardar();
    return { ok: e().notas.length < antes };
  }

  function buscarNotas({ texto, asignatura } = {}) {
    let lista = e().notas.map((n) => ({ ...n, asignatura: nombreAsig(n.asignaturaId) }));
    if (asignatura) lista = lista.filter((n) => n.asignatura?.toLowerCase().includes(asignatura.toLowerCase()));
    if (texto) {
      const t = texto.toLowerCase();
      lista = lista.filter((n) => `${n.titulo} ${n.texto} ${n.asignatura || ''}`.toLowerCase().includes(t));
    }
    return lista.sort((x, y) => Number(y.fijada) - Number(x.fijada) || y.editado.localeCompare(x.editado) || y.id - x.id);
  }

  // ---------- resúmenes ----------

  function resumenDiario() {
    const h = hoy();
    return {
      hoy: eventosEntre(h, h),
      manana: eventosEntre(sumarDias(h, 1), sumarDias(h, 1)),
      proximos: eventosEntre(sumarDias(h, 2), sumarDias(h, 14))
        .filter((x) => TIPOS_CON_AVISO.has(x.tipo))
        .map((x) => ({ ...x, dias: diasHasta(x.inicio) })),
    };
  }

  /** Todo lo guardado, en texto, para que la IA lo tenga delante. */
  function contexto({ maxDocumentos = 60000 } = {}) {
    const L = [];
    L.push('## Asignaturas');
    if (!e().asignaturas.length) L.push('(ninguna todavía)');
    for (const a of verAsignaturas()) {
      const lab = a.examen_final_lab === null ? 'no se sabe' : a.examen_final_lab ? 'sí' : 'no';
      const extra = [a.curso && `curso ${a.curso}`, a.cuatrimestre && `cuatrimestre ${a.cuatrimestre}`, a.profesor && `prof. ${a.profesor}`, `examen final de laboratorio: ${lab}`];
      L.push(`- ${a.nombre}${extra.filter(Boolean).map((x) => ` | ${x}`).join('')}${a.info ? `\n  info: ${a.info.replace(/\n/g, ' / ')}` : ''}`);
    }
    L.push('\n## Eventos (desde hace 7 días; los anteriores búscalos con buscar_eventos)');
    const evs = buscarEventos({ desde: sumarDias(hoy(), -7) });
    if (!evs.length) L.push('(ninguno)');
    for (const x of evs) {
      L.push(`- [id ${x.id}] ${x.inicio}${x.fin ? ` → ${x.fin}` : ''} | ${x.tipo} | ${x.asignatura || 'sin asignatura'} | ${x.titulo}${x.lugar ? ` | lugar: ${x.lugar}` : ''}${x.notas ? ` | notas: ${x.notas}` : ''}`);
    }
    L.push('\n## Memoria (datos que te pidió recordar)');
    if (!e().memoria.length) L.push('(vacía)');
    for (const m of e().memoria) L.push(`- [id ${m.id}] ${m.texto}${m.etiquetas ? ` (${m.etiquetas})` : ''}`);
    L.push('\n## Recordatorios pendientes creados por el usuario');
    const recs = e().recordatorios.filter((r) => !r.hecho);
    if (!recs.length) L.push('(ninguno)');
    for (const r of recs) L.push(`- [id ${r.id}] ${r.cuando}${r.repetir ? ` (${r.repetir})` : ''}: ${r.texto}`);

    L.push('\n## Horario semanal de clases');
    const hor = verHorario();
    if (!hor.length) L.push('(sin horario todavía)');
    for (const c of hor) {
      L.push(`- [clase ${c.id}] ${c.dia_nombre} ${c.inicio}-${c.fin} | ${c.asignatura} | ${NOMBRE_CLASE[c.tipo]}${c.aula ? ` | aula ${c.aula}` : ''}${c.grupo ? ` | grupo ${c.grupo}` : ''}${c.desde || c.hasta ? ` | válida ${c.desde || '…'} a ${c.hasta || '…'}` : ''}${c.notas ? ` | ${c.notas}` : ''}`);
    }
    const cambios = e().cambiosClase.filter((x) => x.fecha >= sumarDias(hoy(), -1)).sort((x, y) => x.fecha.localeCompare(y.fecha));
    if (cambios.length) {
      L.push('Cambios de días concretos (mandan sobre el horario semanal):');
      for (const x of cambios) {
        const c = e().horario.find((h) => h.id === x.horarioId);
        const quien = nombreAsig(x.asignaturaId ?? c?.asignaturaId);
        L.push(`- [cambio ${x.id}] ${x.fecha} | ${quien}${x.horarioId ? ` (clase ${x.horarioId})` : ' (clase EXTRA)'}${x.cancelada ? ' | CANCELADA' : ''}${x.tipo ? ` | ${NOMBRE_CLASE[x.tipo]}` : ''}${x.inicio ? ` | ${x.inicio}-${x.fin || ''}` : ''}${x.aula ? ` | aula ${x.aula}` : ''}${x.nota ? ` | ${x.nota}` : ''}`);
      }
    }

    L.push('\n## Notas del usuario');
    const notas = buscarNotas();
    if (!notas.length) L.push('(ninguna)');
    let presNotas = 20000;
    for (const n of notas) {
      const t = n.texto.slice(0, Math.max(0, presNotas));
      presNotas -= t.length;
      L.push(`- [nota ${n.id}] ${n.fijada ? '📌 ' : ''}${n.titulo}${n.asignatura ? ` (${n.asignatura})` : ''}: ${t.replace(/\n/g, ' / ')}${t.length < n.texto.length ? ' …(recortada)' : ''}`);
    }

    L.push('\n## Documentos e información que ha añadido');
    if (!e().conocimiento.length) L.push('(ninguno)');
    let presupuesto = maxDocumentos;
    for (const d of e().conocimiento) {
      const cabecera = `\n### [documento ${d.id}] ${d.titulo} (${d.tipo}${d.origen ? `: ${d.origen}` : ''})`;
      if (presupuesto <= 0) {
        L.push(`${cabecera}\n(contenido no incluido por espacio: usa leer_documento o buscar_en_documentos)`);
        continue;
      }
      const trozo = d.contenido.slice(0, presupuesto);
      presupuesto -= trozo.length;
      L.push(`${cabecera}\n${trozo}${trozo.length < d.contenido.length ? '\n...(recortado: usa leer_documento para verlo entero)' : ''}`);
    }
    return L.join('\n');
  }

  return {
    buscarAsignatura, guardarAsignatura, verAsignaturas, borrarAsignatura,
    crearEvento, buscarEventos, modificarEvento, borrarEvento, eventosEntre,
    avisosAutomaticos, crearRecordatorio, verRecordatorios, completarRecordatorio, borrarRecordatorio,
    memorizar, buscarMemoria, modificarMemoria, olvidar,
    anadirConocimiento, leerDocumento, buscarEnDocumentos, borrarConocimiento,
    crearClase, verHorario, modificarClase, borrarClase, cambiarClaseDia, borrarCambioClase, clasesDelDia,
    crearNota, modificarNota, borrarNota, buscarNotas,
    resumenDiario, contexto, bonito,
  };
}
