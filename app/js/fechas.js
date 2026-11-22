// Todas las fechas se guardan como texto en hora local: "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM".
// Así se pueden comparar y ordenar como texto sin líos de zonas horarias.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dos = (n) => String(n).padStart(2, '0');

export function aTexto(d, conHora = true) {
  const f = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  return conHora ? `${f}T${dos(d.getHours())}:${dos(d.getMinutes())}` : f;
}

export const ahora = () => aTexto(new Date());
export const hoy = () => aTexto(new Date(), false);

/** Acepta "2026-01-15", "2026-01-15 09:00", "2026-01-15T09:00(:00)". Devuelve formato normalizado o null. */
export function normalizar(texto) {
  if (!texto) return null;
  const m = String(texto).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?/);
  if (!m) return null;
  const [, a, mes, d, h, min] = m;
  const fecha = `${a}-${dos(mes)}-${dos(d)}`;
  return h !== undefined ? `${fecha}T${dos(h)}:${min}` : fecha;
}

export function aDate(texto) {
  const n = normalizar(texto);
  if (!n) return null;
  const [f, h = '00:00'] = n.split('T');
  const [a, m, d] = f.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  return new Date(a, m - 1, d, hh, mm);
}

export const tieneHora = (texto) => String(texto).includes('T');

export function sumarDias(texto, dias) {
  const d = aDate(texto);
  d.setDate(d.getDate() + dias);
  return aTexto(d, tieneHora(texto));
}

export function sumarMinutos(texto, minutos) {
  const d = aDate(texto);
  d.setMinutes(d.getMinutes() + minutos);
  return aTexto(d, true);
}

export function bonito(texto) {
  const d = aDate(texto);
  if (!d) return texto;
  const base = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  return tieneHora(texto) ? `${base}, ${dos(d.getHours())}:${dos(d.getMinutes())}` : base;
}

export function diasHasta(texto) {
  const a = aDate(hoy());
  const b = aDate(normalizar(texto).slice(0, 10));
  return Math.round((b - a) / 86400000);
}
