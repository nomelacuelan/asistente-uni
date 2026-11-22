// Conexión con la IA gratuita de Google (Gemini), directamente desde el móvil con tu propia clave.
import { ahora, bonito } from './fechas.js';
import { declaraciones, ejecutar } from './herramientas.js';

const URL_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_HISTORIAL = 16;
const MAX_PASOS = 12;

export class ErrorIA extends Error {}

/** Llamada básica a Gemini, con reintentos si está saturado. */
export async function llamarGemini({ apiKey, modelo, sistema, contents, tools, temperatura = 0.3, fetchImpl = globalThis.fetch }) {
  if (!apiKey) throw new ErrorIA('Falta tu clave de IA. Ve a ⚙️ Ajustes y pégala (es gratis).');
  const cuerpo = { contents, generationConfig: { temperature: temperatura } };
  if (sistema) cuerpo.systemInstruction = { parts: [{ text: sistema }] };
  if (tools) cuerpo.tools = tools;

  for (let intento = 0; ; intento++) {
    let res;
    try {
      res = await fetchImpl(`${URL_API}/${encodeURIComponent(modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      throw new ErrorIA('Sin conexión a internet. La IA necesita internet (tus datos sí se ven sin conexión).');
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json;

    const msg = json.error?.message || `error ${res.status}`;
    const temporal = res.status === 429 || res.status === 500 || res.status === 503;
    if (temporal && intento < 2) {
      await new Promise((r) => setTimeout(r, 4000 * (intento + 1)));
      continue;
    }
    if (res.status === 429) throw new ErrorIA('⏳ Has llegado al límite gratuito de la IA por ahora. Prueba en un minuto (o mañana si es el límite diario).');
    if (res.status === 400 && /api key/i.test(msg)) throw new ErrorIA('🔑 La clave de IA no es válida. Revísala en ⚙️ Ajustes.');
    if (res.status === 403) throw new ErrorIA(`🔑 Google ha rechazado la clave: ${msg}`);
    if (res.status === 404) throw new ErrorIA(`El modelo "${modelo}" no existe o ya no está disponible. Cámbialo en ⚙️ Ajustes.`);
    throw new ErrorIA(`La IA ha dado un error: ${msg}`);
  }
}

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
      apiKey: ajustes.apiKey,
      modelo: ajustes.modelo,
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
  const resp = await llamarGemini({ apiKey: ajustes.apiKey, modelo: ajustes.modelo, contents, tools, temperatura: 0.1, fetchImpl });
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

/** Comprueba que la clave funciona. */
export async function probarClave(ajustes, fetchImpl) {
  const r = await llamarGemini({ ...ajustes, contents: [{ role: 'user', parts: [{ text: 'Responde solo: OK' }] }], fetchImpl });
  return textoDe(r);
}
