// Pruebas de la lógica de la app (sin navegador):  node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacen, normalizarEstado } from '../js/almacen.js';
import { crearDatos } from '../js/datos.js';
import { ejecutar } from '../js/herramientas.js';
import { conversar, extraerContenido, organizarInformacion } from '../js/ia.js';
import { crearICS, enlaceGoogle } from '../js/calendario.js';
import { hoy, ahora, sumarDias, sumarMinutos } from '../js/fechas.js';

function nuevo() {
  let guardados = 0;
  const almacen = crearAlmacen(null, async () => guardados++);
  almacen.estado.ajustes.apiKey = 'clave';
  return { almacen, datos: crearDatos(almacen), guardados: () => guardados };
}

test('asignaturas: crear, completar con nombre aproximado, sin duplicar', async () => {
  const { datos, guardados } = nuevo();
  await datos.guardarAsignatura({ nombre: 'Física II', profesor: 'Ana Ruiz' });
  await datos.guardarAsignatura({ nombre: 'física', tiene_examen_final_laboratorio: true, info: '40% laboratorio' });
  const lista = datos.verAsignaturas();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].profesor, 'Ana Ruiz');
  assert.equal(lista[0].examen_final_lab, true);
  assert.ok(guardados() >= 2, 'se guarda en el móvil tras cada cambio');
});

test('eventos: semanales, búsqueda, modificar y borrar asignatura en cascada', async () => {
  const { datos } = nuevo();
  const inicio = `${sumarDias(hoy(), 1)}T15:00`;
  const r = await datos.crearEvento({ asignatura: 'Química', tipo: 'practica', titulo: 'Lab', inicio, repetir_semanal_hasta: sumarDias(hoy(), 22) });
  assert.equal(r.creados.length, 4);
  const { creados } = await datos.crearEvento({ asignatura: 'Química', tipo: 'examen', titulo: 'Final', inicio: sumarDias(hoy(), 30) });
  assert.equal(datos.buscarEventos({ asignatura: 'quím', tipo: 'examen' }).length, 1);
  await datos.modificarEvento({ id: creados[0].id, lugar: 'Aula 1' });
  assert.equal(datos.buscarEventos({ texto: 'aula 1' })[0].id, creados[0].id);
  await assert.rejects(datos.crearEvento({ tipo: 'examen', titulo: 'X', inicio: 'el jueves' }), /no es válida/);
  assert.equal((await datos.borrarAsignatura('Química')).eventos_borrados, 5);
  assert.equal(datos.buscarEventos().length, 0);
});

test('avisos automáticos 7/3/1 días: se calculan y se pueden marcar como vistos', async () => {
  const { datos, almacen } = nuevo();
  const { creados } = await datos.crearEvento({ asignatura: 'Cálculo', tipo: 'examen', titulo: 'Final', inicio: `${sumarDias(hoy(), 20)}T09:00`, lugar: 'A1' });
  const avisos = datos.avisosAutomaticos();
  assert.deepEqual(avisos.map((a) => a.cuando), [7, 3, 1].map((d) => `${sumarDias(hoy(), 20 - d)}T09:00`));
  assert.match(avisos[2].texto, /Examen de Cálculo: Final — es MAÑANA a las 09:00 \(A1\)/);
  await datos.completarRecordatorio(avisos[0].id);
  assert.equal(datos.avisosAutomaticos().length, 2);
  // si cambias los días de aviso en ajustes, se recalculan
  almacen.estado.ajustes.avisosDias = [2];
  assert.equal(datos.avisosAutomaticos()[0].cuando, `${sumarDias(hoy(), 18)}T09:00`);
  await datos.borrarEvento(creados[0].id);
  assert.equal(datos.avisosAutomaticos().length, 0);
});

test('recordatorios: vencidos, repetitivos y en pasado', async () => {
  const { datos, almacen } = nuevo();
  assert.equal((await datos.crearRecordatorio({ texto: 'x', cuando: '2020-01-01T10:00' })).ok, false);
  await datos.crearRecordatorio({ texto: '💊 único', cuando: sumarMinutos(ahora(), 5) });
  await datos.crearRecordatorio({ texto: '📚 diario', cuando: sumarMinutos(ahora(), 5), repetir: 'diario' });
  assert.equal(datos.verRecordatorios({ solo_vencidos: true }).length, 0);
  for (const r of almacen.estado.recordatorios) r.cuando = sumarMinutos(ahora(), -1);
  const vencidos = datos.verRecordatorios({ solo_vencidos: true });
  assert.equal(vencidos.length, 2);
  for (const r of vencidos) await datos.completarRecordatorio(r.id);
  const pend = datos.verRecordatorios();
  assert.equal(pend.length, 1);
  assert.equal(pend[0].texto, '📚 diario');
  assert.equal(pend[0].cuando.slice(0, 10), sumarDias(hoy(), 1));
});

test('memoria y documentos: buscar, contexto y recorte por tamaño', async () => {
  const { datos } = nuevo();
  await datos.memorizar({ texto: 'Mi tutor es Luis', etiquetas: 'tutor' });
  assert.equal(datos.buscarMemoria('tutor').length, 1);
  const d = await datos.anadirConocimiento({ titulo: 'Guía Física', tipo: 'archivo', contenido: 'Evaluación: 70% examen. ' + 'x'.repeat(5000) + ' Laboratorio obligatorio.' });
  assert.equal(datos.buscarEnDocumentos('laboratorio obligatorio')[0].documento, d.id);
  const ctx = datos.contexto({ maxDocumentos: 1000 });
  assert.match(ctx, /Mi tutor es Luis/);
  assert.match(ctx, /\[documento \d+\] Guía Física/);
  assert.match(ctx, /recortado: usa leer_documento/);
  assert.equal((await ejecutar(datos, 'leer_documento', { id: d.id })).titulo, 'Guía Física');
});

test('copia de seguridad antigua o incompleta se normaliza al importar', () => {
  const e = normalizarEstado({ eventos: [{ id: 40, tipo: 'examen', titulo: 'X', inicio: '2027-01-01' }], ajustes: { apiKey: 'k' } });
  assert.equal(e.sigId, 41);
  assert.equal(e.ajustes.modelo, 'gemini-3.8-flash');
  assert.deepEqual(e.memoria, []);
});

test('calendario: .ics con alarmas y enlace de Google', async () => {
  const { datos, almacen } = nuevo();
  await datos.crearEvento({ asignatura: 'Física, II', tipo: 'examen', titulo: 'Final', inicio: '2027-01-15T09:00', lugar: 'Aula 2.3' });
  await datos.crearEvento({ tipo: 'entrega', titulo: 'Informe', inicio: '2027-01-20' });
  await datos.crearRecordatorio({ texto: '📚 Repasar', cuando: '2027-01-10T18:00', repetir: 'semanal' });
  const ics = crearICS({ eventos: datos.buscarEventos(), recordatorios: almacen.estado.recordatorios, ajustes: almacen.estado.ajustes });
  assert.match(ics, /DTSTART:20270115T090000\r\nDTEND:20270115T100000/);
  assert.match(ics, /SUMMARY:📝 Examen · Física\\, II: Final/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270120\r\nDTEND;VALUE=DATE:20270121/);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 3 + 3 + 1);
  assert.match(ics, /RRULE:FREQ=WEEKLY/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  const url = new URL(enlaceGoogle(datos.buscarEventos()[0]));
  assert.equal(url.searchParams.get('dates'), '20270115T090000/20270115T100000');
  assert.equal(url.searchParams.get('location'), 'Aula 2.3');
});

// ---------- IA simulada ----------

function geminiFalso(respuestas) {
  const peticiones = [];
  const fetchImpl = async (url, op) => {
    peticiones.push({ url, headers: op.headers, cuerpo: JSON.parse(op.body) });
    const r = respuestas.shift();
    if (r.status) return { ok: false, status: r.status, json: async () => r.json };
    return { ok: true, status: 200, json: async () => r };
  };
  return { fetchImpl, peticiones };
}
const respTexto = (t) => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });
const respLlamada = (name, args) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'c1', name, args }, thoughtSignature: 'firma' }] } }] });

test('chat: la IA guarda con herramientas y la conversación se recuerda', async () => {
  const { datos, almacen } = nuevo();
  const fecha = `${sumarDias(hoy(), 25)}T09:00`;
  const { fetchImpl, peticiones } = geminiFalso([respLlamada('crear_evento', { asignatura: 'Física II', tipo: 'examen', titulo: 'Final', inicio: fecha }), respTexto('✅ Guardado')]);
  const r = await conversar({ datos, almacen, texto: 'El final de Física II es en 25 días a las 9', fetchImpl });
  assert.equal(r.texto, '✅ Guardado');
  assert.deepEqual(r.acciones, ['crear_evento']);
  assert.equal(datos.buscarEventos().length, 1);
  assert.equal(peticiones[0].headers['x-goog-api-key'], 'clave');
  assert.match(peticiones[0].url, /gemini-3\.8-flash:generateContent$/);
  // 2ª petición: lleva la llamada original (con su firma) y el resultado
  const c = peticiones[1].cuerpo.contents;
  assert.equal(c.at(-2).parts[0].thoughtSignature, 'firma');
  assert.equal(c.at(-1).parts[0].functionResponse.id, 'c1');
  assert.equal(c.at(-1).parts[0].functionResponse.response.resultado.ok, true);

  const g2 = geminiFalso([respTexto('Es el ...')]);
  await conversar({ datos, almacen, texto: '¿Cuándo era?', fetchImpl: g2.fetchImpl });
  const p = g2.peticiones[0].cuerpo;
  assert.equal(p.contents.length, 3);
  assert.match(p.systemInstruction.parts[0].text, /examen \| Física II \| Final/);
});

test('añadir información: web → texto → agenda', async () => {
  const { datos, almacen } = nuevo();
  const g = geminiFalso([
    respTexto('TÍTULO: Calendario de exámenes 2º\nFísica II: 15/01/2027 9:00'),
    respLlamada('crear_evento', { asignatura: 'Física II', tipo: 'examen', titulo: 'Final', inicio: '2027-01-15T09:00' }),
    respTexto('He guardado el examen de Física II.'),
  ]);
  const ext = await extraerContenido({ ajustes: almacen.estado.ajustes, url: 'https://uni.es/examenes', fetchImpl: g.fetchImpl });
  assert.deepEqual(ext, { titulo: 'Calendario de exámenes 2º', contenido: 'Física II: 15/01/2027 9:00' });
  assert.deepEqual(g.peticiones[0].cuerpo.tools, [{ urlContext: {} }]);
  await datos.anadirConocimiento({ ...ext, tipo: 'url', origen: 'https://uni.es/examenes' });
  const r = await organizarInformacion({ datos, ajustes: almacen.estado.ajustes, ...ext, fetchImpl: g.fetchImpl });
  assert.equal(r.texto, 'He guardado el examen de Física II.');
  assert.equal(datos.buscarEventos()[0].asignatura, 'Física II');
  assert.equal(almacen.estado.historial.length, 0, 'no ensucia la conversación del chat');
});

test('errores de la IA se explican en español', async () => {
  const { datos, almacen } = nuevo();
  const g = geminiFalso([{ status: 400, json: { error: { message: 'API key not valid. Please pass a valid API key.' } } }]);
  await assert.rejects(conversar({ datos, almacen, texto: 'hola', fetchImpl: g.fetchImpl }), /clave de IA no es válida/);
  almacen.estado.ajustes.apiKey = '';
  await assert.rejects(conversar({ datos, almacen, texto: 'hola', fetchImpl: g.fetchImpl }), /Falta tu clave/);
});

// ---------- horario ----------

test('horario: clases semanales, varios días a la vez y validaciones', async () => {
  const { datos } = nuevo();
  const r = await datos.crearClase({ asignatura: 'Física II', dias: ['lunes', 'miércoles'], inicio: '9:00', fin: '11:00', aula: '2.3', tipo: 'teoria' });
  assert.equal(r.ids.length, 2);
  await datos.crearClase({ asignatura: 'Química', dia: 'X', inicio: '08:00', fin: '09:00', aula: 'L1', tipo: 'laboratorio' });
  const h = datos.verHorario();
  assert.deepEqual(h.map((c) => `${c.dia_nombre} ${c.inicio} ${c.asignatura}`), ['lunes 09:00 Física II', 'miércoles 08:00 Química', 'miércoles 09:00 Física II']);
  await assert.rejects(datos.crearClase({ asignatura: 'X', dia: 'lunes', inicio: '11:00', fin: '10:00' }), /después/);
  await assert.rejects(datos.crearClase({ asignatura: 'X', dia: 'funes', inicio: '10:00', fin: '11:00' }), /día no es válido/);
  assert.equal(datos.verAsignaturas().length, 3, 'crea las asignaturas que no existían');
});

test('horario: un día concreto toca laboratorio, otro se cancela y hay una clase extra', async () => {
  const { datos } = nuevo();
  const { ids } = await datos.crearClase({ asignatura: 'Física II', dias: ['lunes'], inicio: '09:00', fin: '11:00', aula: '2.3' });
  const lunes = '2027-02-01'; // lunes
  const siguiente = '2027-02-08';
  assert.equal(datos.clasesDelDia(lunes)[0].tipo, 'teoria');
  await datos.cambiarClaseDia({ clase_id: ids[0], fecha: lunes, tipo: 'laboratorio', aula: 'L2', nota: 'traer bata' });
  const c = datos.clasesDelDia(lunes)[0];
  assert.deepEqual([c.tipo, c.aula, c.nota, c.cambiada], ['laboratorio', 'L2', 'traer bata', true]);
  assert.equal(datos.clasesDelDia(siguiente)[0].tipo, 'teoria', 'las demás semanas siguen igual');
  await datos.cambiarClaseDia({ clase_id: ids[0], fecha: siguiente, cancelada: true });
  assert.equal(datos.clasesDelDia(siguiente)[0].cancelada, true);
  assert.equal((await datos.cambiarClaseDia({ clase_id: ids[0], fecha: '2027-02-02' })).ok, false, 'el 2 de febrero no es lunes');
  await datos.cambiarClaseDia({ fecha: siguiente, asignatura: 'Química', tipo: 'laboratorio', inicio: '12:00', fin: '14:00', aula: 'L1' });
  const dia = datos.clasesDelDia(siguiente);
  assert.deepEqual(dia.map((x) => `${x.inicio} ${x.asignatura} ${x.extra}`), ['09:00 Física II false', '12:00 Química true']);
  assert.match(datos.contexto(), /\[cambio \d+\] 2027-02-01 \| Física II \(clase \d+\) \| Laboratorio \| aula L2 \| traer bata/);
  await datos.borrarCambioClase(c.cambioId);
  assert.equal(datos.clasesDelDia(lunes)[0].tipo, 'teoria');
  await datos.borrarClase(ids[0]);
  assert.equal(datos.clasesDelDia(siguiente).length, 1);
});

test('horario: respeta desde/hasta del cuatrimestre', async () => {
  const { datos } = nuevo();
  await datos.crearClase({ asignatura: 'Cálculo', dias: ['martes'], inicio: '10:00', fin: '12:00', desde: '2027-02-01', hasta: '2027-05-31' });
  assert.equal(datos.clasesDelDia('2027-01-26').length, 0);
  assert.equal(datos.clasesDelDia('2027-02-02').length, 1);
  assert.equal(datos.clasesDelDia('2027-06-01').length, 0);
});

// ---------- notas ----------

test('notas: crear, buscar, fijar, añadir texto y borrar', async () => {
  const { datos } = nuevo();
  const a = await datos.crearNota({ texto: 'Fórmulas del tema 3\nF = m·a', asignatura: 'Física' });
  await datos.crearNota({ titulo: 'Compra', texto: 'Bata y gafas' });
  assert.equal(datos.buscarNotas()[0].titulo, 'Compra', 'la más reciente primero');
  await datos.modificarNota({ id: a.id, fijada: true });
  assert.equal(datos.buscarNotas()[0].id, a.id, 'las fijadas arriba');
  assert.equal(datos.buscarNotas()[0].titulo, 'Fórmulas del tema 3');
  await datos.modificarNota({ id: a.id, texto: 'E = m·c²', anadir: true });
  assert.match(datos.buscarNotas({ texto: 'c²' })[0].texto, /F = m·a\nE = m·c²/);
  assert.equal(datos.buscarNotas({ asignatura: 'fís' }).length, 1);
  assert.match(datos.contexto(), /\[nota \d+\] 📌 Fórmulas del tema 3 \(Física\)/);
  await datos.borrarNota(a.id);
  assert.equal(datos.buscarNotas().length, 1);
  await assert.rejects(datos.crearNota({ texto: '  ' }), /vacía/);
});

test('la IA puede gestionar horario y notas con sus herramientas', async () => {
  const { datos } = nuevo();
  const r = await ejecutar(datos, 'crear_clase', { asignatura: 'Física', dias: ['jueves'], inicio: '15:00', fin: '17:00', tipo: 'laboratorio', aula: 'L3' });
  assert.equal(r.ok, true);
  const clases = await ejecutar(datos, 'ver_clases_dia', { fecha: '2027-02-04' }); // jueves
  assert.equal(clases[0].aula, 'L3');
  assert.equal((await ejecutar(datos, 'crear_nota', { texto: 'Traer calculadora' })).ok, true);
  assert.equal((await ejecutar(datos, 'buscar_notas', { texto: 'calculadora' })).length, 1);
  await ejecutar(datos, 'borrar_asignatura', { nombre: 'Física' });
  assert.equal(datos.verHorario().length, 0, 'borrar la asignatura quita sus clases');
});
