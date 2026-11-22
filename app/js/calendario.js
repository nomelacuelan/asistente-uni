// Pasar eventos y recordatorios al calendario del móvil.
// - Archivo .ics: lo abre el Calendario del iPhone (y la mayoría de calendarios), con sus alarmas.
// - Enlace de Google Calendar: abre el evento ya rellenado en Google Calendar.
import { aDate, sumarDias, sumarMinutos, tieneHora } from './fechas.js';
import { NOMBRE_TIPO, ICONO_TIPO } from './datos.js';

const compacto = (t) => t.replace(/[-:]/g, ''); // 2027-01-15T09:00 → 20270115T0900
const fechaICS = (t) => (tieneHora(t) ? `${compacto(t)}00` : compacto(t.slice(0, 10)));
const utcICS = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function escapar(t = '') {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Las líneas de un .ics no deben pasar de 75 caracteres
function plegar(linea) {
  const trozos = [];
  let resto = linea;
  while (resto.length > 74) {
    trozos.push(resto.slice(0, 74));
    resto = ' ' + resto.slice(74);
  }
  trozos.push(resto);
  return trozos.join('\r\n');
}

export function tituloEvento(ev) {
  return `${ICONO_TIPO[ev.tipo] || '📌'} ${NOMBRE_TIPO[ev.tipo] || ''}${ev.asignatura ? ` · ${ev.asignatura}` : ''}: ${ev.titulo}`;
}

function vevento(ev, ajustes, sello) {
  const L = ['BEGIN:VEVENT', `UID:evento-${ev.id}@asistente-uni`, `DTSTAMP:${sello}`, `SUMMARY:${escapar(tituloEvento(ev))}`];
  if (tieneHora(ev.inicio)) {
    const fin = ev.fin && tieneHora(ev.fin) ? ev.fin : sumarMinutos(ev.inicio, 60);
    L.push(`DTSTART:${fechaICS(ev.inicio)}`, `DTEND:${fechaICS(fin)}`);
  } else {
    L.push(`DTSTART;VALUE=DATE:${fechaICS(ev.inicio)}`, `DTEND;VALUE=DATE:${fechaICS(sumarDias((ev.fin || ev.inicio).slice(0, 10), 1))}`);
  }
  if (ev.lugar) L.push(`LOCATION:${escapar(ev.lugar)}`);
  if (ev.notas) L.push(`DESCRIPTION:${escapar(ev.notas)}`);
  // Alarmas: exámenes y entregas X días antes a la hora de aviso; el resto, 1 hora antes
  if (['examen', 'examen_laboratorio', 'entrega'].includes(ev.tipo)) {
    for (const dias of ajustes.avisosDias) {
      const cuando = aDate(`${sumarDias(ev.inicio.slice(0, 10), -dias)}T${ajustes.avisosHora}`);
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(`${dias === 1 ? 'Mañana' : `En ${dias} días`}: ${tituloEvento(ev)}`)}`, `TRIGGER;VALUE=DATE-TIME:${utcICS(cuando)}`, 'END:VALARM');
    }
  } else if (tieneHora(ev.inicio)) {
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(tituloEvento(ev))}`, 'TRIGGER:-PT1H', 'END:VALARM');
  }
  L.push('END:VEVENT');
  return L;
}

const REGLA = { diario: 'DAILY', semanal: 'WEEKLY', mensual: 'MONTHLY' };

function vrecordatorio(r, sello) {
  const L = [
    'BEGIN:VEVENT',
    `UID:recordatorio-${r.id}@asistente-uni`,
    `DTSTAMP:${sello}`,
    `SUMMARY:${escapar(r.texto)}`,
    `DTSTART:${fechaICS(r.cuando)}`,
    `DTEND:${fechaICS(sumarMinutos(r.cuando, 15))}`,
  ];
  if (r.repetir) L.push(`RRULE:FREQ=${REGLA[r.repetir]}`);
  L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(r.texto)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  return L;
}

/** Crea el contenido de un archivo .ics con los eventos y recordatorios dados. */
export function crearICS({ eventos = [], recordatorios = [], ajustes }) {
  const sello = utcICS(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Asistente Uni//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Universidad'];
  for (const ev of eventos) L.push(...vevento(ev, ajustes, sello));
  for (const r of recordatorios) L.push(...vrecordatorio(r, sello));
  L.push('END:VCALENDAR');
  return L.map(plegar).join('\r\n') + '\r\n';
}

/** Enlace que abre Google Calendar con el evento rellenado. */
export function enlaceGoogle(ev) {
  let fechas;
  if (tieneHora(ev.inicio)) {
    const fin = ev.fin && tieneHora(ev.fin) ? ev.fin : sumarMinutos(ev.inicio, 60);
    fechas = `${fechaICS(ev.inicio)}/${fechaICS(fin)}`;
  } else {
    fechas = `${fechaICS(ev.inicio)}/${fechaICS(sumarDias((ev.fin || ev.inicio).slice(0, 10), 1))}`;
  }
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.titulo && ev.tipo ? tituloEvento(ev) : ev.texto, dates: fechas });
  if (ev.lugar) p.set('location', ev.lugar);
  if (ev.notas) p.set('details', ev.notas);
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Enlace de Google Calendar para un recordatorio. */
export function enlaceGoogleRecordatorio(r) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: r.texto, dates: `${fechaICS(r.cuando)}/${fechaICS(sumarMinutos(r.cuando, 15))}` });
  if (r.repetir) p.set('recur', `RRULE:FREQ=${REGLA[r.repetir]}`);
  return `https://calendar.google.com/calendar/render?${p}`;
}
