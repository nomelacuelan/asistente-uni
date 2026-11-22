// Conexión con la IA gratuita de Google (Gemini), directamente desde el móvil con tu propia clave.
import { ahora, bonito } from './fechas.js';
import { declaraciones, ejecutar } from './herramientas.js';

const URL_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_HISTORIAL = 16;
const MAX_PASOS = 12;

export class ErrorIA extends Error {}

/** Lista los modelos que tu clave puede usar para generar texto. */
export async function listarModelos(apiKey, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(`${URL_API}?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  } catch {
    throw new ErrorIA('Sin conexión a internet.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw errorDeGoogle(res.status, json.error?.message || `error ${res.status}`, '');
  return (json.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
}

/** Elige el mejor modelo "flash" estable de la lista (el de versión más alta). */
export function elegirModelo(nombres, evitar = []) {
  const version = (n) => (n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] * 1 || 0;
  const candidatos = nombres.filter((n) => /^gemini-/.test(n) && !evitar.includes(n) && !/(tts|image|audio|live|embedding|robotics|computer|native)/i.test(n));
  const orden = (lista) => lista.sort((a, b) => version(b) - version(a) || a.length - b.length);
  const estables = candidatos.filter((n) => !/(preview|exp|latest)/i.test(n));
  return (
    orden(estables.filter((n) => /-flash$/.test(n)))[0] ||
    orden(estables.filter((n) => /flash/.test(n) && !/lite/.test(n)))[0] ||
    orden(estables.filter((n) => /flash/.test(n)))[0] ||
    orden(candidatos.filter((n) => /flash/.test(n)))[0] ||
    orden(candidatos)[0] ||
    null
  );
}

/** Lee los detalles de cuota que manda Google en un error 429. */
export function analizarCuota(error = {}) {
  const detalles = Array.isArray(error.details) ? error.details : [];
  const violaciones = detalles.flatMap((d) => (String(d['@type']).includes('QuotaFailure') ? d.violations || [] : []));
  const espera = detalles.find((d) => String(d['@type']).includes('RetryInfo'))?.retryDelay; // p. ej. "37s"
  const ids = violaciones.map((v) => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
  const texto = `${error.message || ''} ${ids}`;
  return {
    limiteCero: violaciones.some((v) => String(v.quotaValue) === '0') || /limit:\s*0\b/i.test(texto),
    porDia: /per\s*day|PerDay/i.test(texto),
    porMinuto: /per\s*minute|PerMinute/i.test(texto),
    esperaSeg: espera ? Math.ceil(parseFloat(espera)) : null,
    detalle: violaciones.length
      ? violaciones.map((v) => `${v.quotaId || v.quotaMetric}${v.quotaValue !== undefined ? ` (límite ${v.quotaValue})` : ''}`).join('; ')
      : String(error.message || '').slice(0, 200),
  };
}

function errorDeGoogle(status, msg, modelo, error = {}, probados = []) {
  if (status === 429) {
    const c = analizarCuota(error);
    const modelos = [...new Set([...probados, modelo])].join(', ');
    let explicacion;
    if (c.limiteCero) {
      explicacion = `🔒 Google dice que tu proyecto no tiene uso gratuito para ${modelos === modelo ? `el modelo ${modelo}` : `los modelos ${modelos}`} (límite 0). Suele pasar con proyectos nuevos o importados que Google aún no ha verificado. Prueba a crear una clave en un PROYECTO NUEVO en aistudio.google.com/apikey, o mira tus límites en aistudio.google.com/rate-limit.`;
    } else if (c.porDia) {
      explicacion = `📅 Se ha agotado el límite diario gratuito de ${modelos}. Se reinicia a las 9:00 (hora de España).`;
    } else if (c.porMinuto) {
      explicacion = `⏳ Demasiadas peticiones en poco tiempo. Espera ${c.esperaSeg ? `${c.esperaSeg} segundos` : 'un minuto'} y vuelve a probar.`;
    } else {
      explicacion = `⏳ Google dice que se ha superado una cuota (probado con: ${modelos}). Mira tus límites en aistudio.google.com/rate-limit.`;
    }
    return new ErrorIA(`${explicacion}\n\nDetalle de Google: ${c.detalle}`);
  }
  if ((status === 400 || status === 401 || status === 403) && /api[ _-]?key/i.test(msg)) return new ErrorIA('🔑 La clave de IA no es válida. Cópiala otra vez de aistudio.google.com/apikey y pégala en ☰ Más → ⚙️ Ajustes.');
  if (status === 401) {
    return new ErrorIA(`🔑 Google no acepta esta clave (${/ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(msg) ? 'tipo de clave no admitido' : 'no autorizada'}). Prueba a crear una clave NUEVA en aistudio.google.com/apikey (botón "Create API key", en un proyecto nuevo) y pégala completa, incluido el "AQ." del principio.`);
  }
  if (/location is not supported/i.test(msg)) return new ErrorIA('🌍 Google no permite usar su IA gratuita desde tu ubicación actual.');
  if (status === 403) return new ErrorIA(`🔑 Google ha rechazado la clave: ${msg}`);
  if (status === 404) return new ErrorIA(`El modelo "${modelo}" no está disponible para tu clave. Pulsa "Probar" en ⚙️ Ajustes para elegir uno automáticamente.`);
  if (status === 503 || status === 500) return new ErrorIA('🚦 Los servidores de IA de Google están saturados ahora mismo (no es un fallo de tu app ni de tu clave). Vuelve a intentarlo en unos minutos.');
  return new ErrorIA(`La IA ha dado un error (${status}): ${msg}`);
}

// Errores que indican que ESE modelo no se puede usar (pero otro sí)
const modeloNoSirve = (status, msg, error) =>
  status === 404 || (status === 400 && /(not found|not supported|is not available|unsupported model)/i.test(msg)) || (status === 429 && analizarCuota(error).limiteCero);

/**
 * Llamada básica a Gemini, con reintentos si está saturado.
 * Si el modelo configurado no existe o no es gratuito para tu clave, elige otro automáticamente
 * y lo guarda en `ajustes.modelo`.
 */
export async function llamarGemini({ ajustes, apiKey, modelo, sistema, contents, tools, temperatura = 0.3, fetchImpl = globalThis.fetch }) {
  ajustes ||= { apiKey, modelo };
  if (!ajustes.apiKey) throw new ErrorIA('Falta tu clave de IA. Ve a ☰ Más → ⚙️ Ajustes y pégala (es gratis).');
  ajustes.modelo ||= 'gemini-3.8-flash';
  const cuerpo = { contents, generationConfig: { temperature: temperatura } };
  if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };
  if (tools) cuerpo.tools = tools;
  const probados = [];
  const saturados = [];
  const cuotas = [];
  // Si hace poco el modelo principal estaba saturado, se sigue usando el de reserva un rato
  // (así toda una conversación usa el mismo modelo)
  const reserva = respaldo.get(ajustes.apiKey);
  let modeloUso = reserva && reserva.hasta > Date.now() && reserva.principal === ajustes.modelo ? reserva.modelo : ajustes.modelo;

  for (let intento = 0; ; intento++) {
    let res;
    try {
      res = await fetchImpl(`${URL_API}/${encodeURIComponent(modeloUso)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ajustes.apiKey },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      throw new ErrorIA('Sin conexión a internet. La IA necesita internet (tus datos sí se ven sin conexión).');
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;

    const msg = json.error?.message || `error ${res.status}`;

    // 1) Ese modelo no existe o no es gratis para tu clave → se cambia para siempre
    if (modeloNoSirve(res.status, msg, json.error) && probados.length < 3) {
      probados.push(modeloUso);
      const otro = elegirModelo((await listarModelos(ajustes.apiKey, fetchImpl).catch(() => null)) || [], probados);
      if (otro) {
        console.warn(`Modelo ${modeloUso} no disponible (${res.status}); uso ${otro}`);
        ajustes.modelo = modeloUso = otro;
        continue;
      }
    }

    // 2) Google está saturado (503/500) → un reintento rápido y, si sigue, otro modelo de reserva durante 15 min
    if ((res.status === 503 || res.status === 500) && saturados.length < 3) {
      if (!saturados.includes(modeloUso) && intento === 0) {
        saturados.push(modeloUso);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!saturados.includes(modeloUso)) saturados.push(modeloUso);
      const lista = (await listarModelos(ajustes.apiKey, fetchImpl).catch(() => null)) || MODELOS_RESERVA;
      const otro = elegirModelo(lista, [...saturados, ...probados]);
      if (otro) {
        console.warn(`Modelo ${modeloUso} saturado; uso ${otro} un rato`);
        modeloUso = otro;
        respaldo.set(ajustes.apiKey, { principal: ajustes.modelo, modelo: otro, hasta: Date.now() + 15 * 60 * 1000 });
        continue;
      }
    }

    // 3) Cuota superada (429). Cada modelo tiene su propia cuota gratuita, así que se prueba otro.
    if (res.status === 429 && cuotas.length < 3) {
      const c = analizarCuota(json.error);
      // Límite por minuto con espera corta: esperar y reintentar el mismo modelo una vez
      if (c.porMinuto && !c.porDia && !cuotas.includes(modeloUso) && (c.esperaSeg ?? 10) <= 20) {
        cuotas.push(modeloUso);
        await new Promise((r) => setTimeout(r, ((c.esperaSeg ?? 10) + 1) * 1000));
        continue;
      }
      if (!cuotas.includes(modeloUso)) cuotas.push(modeloUso);
      const lista = (await listarModelos(ajustes.apiKey, fetchImpl).catch(() => null)) || MODELOS_RESERVA;
      const otro = elegirModelo(lista, [...cuotas, ...probados, ...saturados]);
      if (otro) {
        console.warn(`Cuota agotada en ${modeloUso} (${c.detalle}); pruebo ${otro}`);
        modeloUso = otro;
        respaldo.set(ajustes.apiKey, { principal: ajustes.modelo, modelo: otro, hasta: Date.now() + (c.porDia ? 6 * 3600 : 15 * 60) * 1000 });
        continue;
      }
    }
    throw errorDeGoogle(res.status, msg, modeloUso, json.error, [...probados, ...cuotas]);
  }
}

// Modelos de reserva si no se puede leer la lista de Google
const MODELOS_RESERVA = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const respaldo = new Map();
/** Solo para pruebas */
export const olvidarRespaldo = () => respaldo.clear();

const textoDe = (resp) =>
  (resp.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();

function instrucciones(datos, ajustes) {
  return `Eres el asistente personal de un estudiante universitario, dentro de su app del móvil. Respondes en español, cercano y breve.

Fecha y hora actual: ${bonito(ahora())} (${ahora()}).

Lo que haces:
- Guardar y consultar sus asignaturas: exámenes, prácticas de laboratorio, entregas, si tienen examen final de laboratorio, profesores, % de nota, etc.
- Llevar su horario de clases semanal (asignatura, día, horas, aula, si es teoría, laboratorio o prácticas) y los cambios de días concretos.
- Guardar notas en su apartado de Notas cuando quiera apuntar algo concreto ("apunta...", "toma nota...").
- Llevar su lista de Tareas (cosas por hacer con prioridad y fecha) cuando diga "tengo que...", "añade una tarea...".
- Calculadora de notas: guardar cómo se evalúa cada asignatura (partes con su %) y las notas que saca, y decirle qué necesita para aprobar.
- Contar sus faltas a las clases de LABORATORIO y avisarle si se acerca al máximo permitido.
- Memorizar cualquier dato que te pida y recordárselo cuando pregunte.
- Crear recordatorios (la app le avisa y puede pasarlos al calendario del móvil).
- Responder usando los documentos, webs e imágenes que ha añadido a la app.
- Ayudarle a organizarse y a estudiar.

Reglas:
- Usa SIEMPRE las herramientas para guardar, cambiar o borrar datos. Nunca digas que has guardado algo si la herramienta no ha devuelto ok.
- Convierte fechas relativas ("el jueves", "mañana a las 5") a fechas exactas usando la fecha actual. Horas en formato 24h.
- Si dan una fecha sin año, usa la próxima vez que ocurra.
- Si falta un dato imprescindible (la fecha), pregunta. Si falta algo secundario (aula, hora), guárdalo sin eso.
- Si te mandan una foto, PDF o lista con muchas fechas, extrae todo y guárdalo con varias llamadas a herramientas, y luego resume lo guardado.
- Para responder, usa la información de abajo. Si algo no está, dilo claramente: NUNCA inventes fechas. Si la respuesta sale de un documento, di de cuál.
- Horario: si te dicen que un día concreto toca laboratorio en vez de teoría, cambia el aula o se suspende una clase, usa cambiar_clase_un_dia (no cambies el horario semanal). Si te mandan una foto del horario, crea todas las clases.
- Para "¿qué clase tengo ahora / mañana / el jueves?" usa el horario y sus cambios; da hora, asignatura, aula y si es teoría o laboratorio.
- Antes de borrar algo importante (una asignatura entera, varios eventos) pide confirmación.
- Escribe las fechas de forma legible ("jueves 15 de enero, 9:00").
- Formato: **negrita**, _cursiva_, listas con "•". Sin tablas ni títulos con #.
- No guardes contraseñas, PINs ni datos bancarios.

=== DATOS GUARDADOS ===
${datos.contexto()}`;
}

/**
 * Bucle de la IA con herramientas: la IA pide acciones, se ejecutan, y repite hasta tener la respuesta.
 * @returns {Promise<{texto: string, acciones: string[]}>}
 */
export async function ejecutarConHerramientas({ datos, ajustes, contents, fetchImpl }) {
  const acciones = [];
  for (let paso = 0; paso < MAX_PASOS; paso++) {
    const resp = await llamarGemini({
      ajustes,
      sistema: instrucciones(datos, ajustes),
      contents,
      tools: [{ functionDeclarations: declaraciones }],
      fetchImpl,
    });
    const contenido = resp.candidates?.[0]?.content;
    const llamadas = (contenido?.parts || []).filter((p) => p.functionCall).map((p) => p.functionCall);
    if (!llamadas.length) {
      const motivo = resp.candidates?.[0]?.finishReason;
      const texto = textoDe(resp) || (motivo === 'SAFETY' ? 'No puedo responder a eso.' : '🤔 No he sabido qué responder. ¿Me lo dices de otra forma?');
      return { texto, acciones };
    }
    // Se devuelve el contenido tal cual (incluye las "firmas de pensamiento" que exige Gemini 3)
    contents.push(contenido);
    const respuestas = [];
    for (const ll of llamadas) {
      const resultado = await ejecutar(datos, ll.name, ll.args);
      acciones.push(ll.name);
      const fr = { name: ll.name, response: { resultado } };
      if (ll.id) fr.id = ll.id;
      respuestas.push({ functionResponse: fr });
    }
    contents.push({ role: 'user', parts: respuestas });
  }
  return { texto: '⚠️ Me he liado con tantas operaciones. Revisa la Agenda y dime lo que falte.', acciones };
}

/** Un mensaje del chat. Guarda la conversación para recordar el contexto. */
export async function conversar({ datos, almacen, texto, adjuntos = [], fetchImpl }) {
  const estado = almacen.estado;
  const partes = adjuntos.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } }));
  const textoUsuario = texto?.trim() || 'Te envío este archivo: extrae la información útil sobre mis asignaturas y guárdala.';
  partes.push({ text: textoUsuario });

  const previos = estado.historial.slice(-MAX_HISTORIAL);
  while (previos.length && previos[0].rol !== 'user') previos.shift();
  const contents = [...previos.map((h) => ({ role: h.rol, parts: [{ text: h.texto }] })), { role: 'user', parts: partes }];

  const res = await ejecutarConHerramientas({ datos, ajustes: estado.ajustes, contents, fetchImpl });
  const desc = adjuntos.map((a) => `[${a.nombre || a.mimeType}]`).join(' ');
  estado.historial.push({ rol: 'user', texto: [desc, texto].filter(Boolean).join(' ') || desc, fecha: ahora() });
  estado.historial.push({ rol: 'model', texto: res.texto, fecha: ahora() });
  estado.historial = estado.historial.slice(-200);
  await almacen.guardar();
  return res;
}

/** Saca el contenido de una web, PDF o imagen en texto, para guardarlo en la base de conocimiento. */
export async function extraerContenido({ ajustes, url, archivo, fetchImpl }) {
  const pedido = `Extrae TODO el contenido útil para un estudiante universitario (asignaturas, fechas, horarios, aulas, profesores, criterios de evaluación, temario, normas...).
Escribe la primera línea exactamente así: TÍTULO: <un título corto y claro>
Después, el contenido completo en texto, ordenado y fiel al original. No resumas las fechas ni los datos concretos: cópialos todos. Si es una imagen, transcribe todo el texto que se lea.`;
  let contents;
  let tools;
  if (url) {
    contents = [{ role: 'user', parts: [{ text: `${pedido}\n\nURL: ${url}` }] }];
    tools = [{ urlContext: {} }];
  } else {
    contents = [{ role: 'user', parts: [{ inlineData: { mimeType: archivo.mimeType, data: archivo.data } }, { text: pedido }] }];
  }
  const resp = await llamarGemini({ ajustes, contents, tools, temperatura: 0.1, fetchImpl });
  const texto = textoDe(resp);
  if (!texto) throw new ErrorIA(url ? 'No he podido leer esa web. Comprueba que el enlace es público, o copia y pega el texto.' : 'No he podido leer ese archivo.');
  const m = texto.match(/^\s*\**T[ÍI]TULO:?\**\s*(.+)\n/i);
  return { titulo: m ? m[1].replace(/\*+/g, '').trim() : (archivo?.nombre || url || 'Documento'), contenido: m ? texto.slice(m[0].length).trim() : texto };
}

/** Pide a la IA que guarde en la agenda las fechas y asignaturas que haya en un texto. No toca el chat. */
export async function organizarInformacion({ datos, ajustes, titulo, contenido, fetchImpl }) {
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `He añadido a la app esta información ("${titulo}"). Ya está guardada como documento, NO la memorices entera.
Tu tarea: usa las herramientas para guardar en la agenda lo que sea útil y concreto:
• asignaturas (y sus datos: profesor, si tienen examen final de laboratorio, % de nota...)
• horario de clases semanal (día, horas, aula, teoría/laboratorio/prácticas) y cambios de días concretos
• exámenes, prácticas de laboratorio, entregas y otras fechas
• datos sueltos importantes que no sean fechas → memorizar
Si algo ya estaba guardado igual, no lo dupliques; si ha cambiado, modifícalo.
Si no hay nada de eso, no guardes nada.
Al final responde con un resumen breve de lo que has guardado.

---
${contenido.slice(0, 100000)}`,
        },
      ],
    },
  ];
  return ejecutarConHerramientas({ datos, ajustes, contents, fetchImpl });
}

/**
 * Comprueba que la clave funciona y elige un modelo disponible si el configurado no lo está.
 * Modifica `ajustes.modelo` si hace falta. Devuelve el modelo que funciona.
 */
export async function probarClave(ajustes, fetchImpl) {
  if (!ajustes.apiKey) throw new ErrorIA('Pega primero la clave.');
  // Si la lista de modelos no se puede leer con esta clave, se prueba directamente con el modelo configurado
  const disponibles = await listarModelos(ajustes.apiKey, fetchImpl).catch(() => null);
  if (disponibles?.length && !disponibles.includes(ajustes.modelo)) ajustes.modelo = elegirModelo(disponibles) || ajustes.modelo;
  await llamarGemini({ ajustes, contents: [{ role: 'user', parts: [{ text: 'Responde solo: OK' }] }], fetchImpl });
  return ajustes.modelo;
}
