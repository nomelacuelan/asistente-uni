// Acciones que la IA puede hacer sobre tus datos.
import { TIPOS_EVENTO, TIPOS_CLASE, PRIORIDADES } from './datos.js';

const fecha = (desc) => ({ type: 'string', description: `${desc}. Formato YYYY-MM-DD (todo el día) o YYYY-MM-DDTHH:MM (hora local).` });
const hora = (desc) => ({ type: 'string', description: `${desc}. Formato HH:MM (24h).` });
const DIA = { type: 'string', description: 'Día de la semana: lunes, martes, miércoles, jueves, viernes, sábado o domingo.' };
const soloId = { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] };

export const declaraciones = [
  {
    name: 'guardar_asignatura',
    description: 'Crea una asignatura o actualiza sus datos (solo cambia los campos que pases).',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la asignatura (se busca aunque no sea exacto).' },
        nombre_nuevo: { type: 'string', description: 'Solo para renombrarla.' },
        curso: { type: 'string' },
        cuatrimestre: { type: 'string' },
        profesor: { type: 'string' },
        tiene_examen_final_laboratorio: { type: 'boolean' },
        info: { type: 'string', description: 'Otra información: ponderación de la nota, aula, tutorías, requisitos para aprobar...' },
        anadir_info: { type: 'boolean', description: 'true para añadir "info" a la que ya había en vez de sustituirla.' },
        max_faltas_laboratorio: { type: 'integer', description: 'Número máximo de faltas permitidas a las clases de laboratorio.' },
        nota_objetivo: { type: 'number', description: 'Nota que quiere sacar (por defecto 5).' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'ver_asignaturas',
    description: 'Lista las asignaturas con todos sus datos y eventos.',
    parametersJsonSchema: { type: 'object', properties: { nombre: { type: 'string', description: 'Filtrar por nombre (opcional).' } } },
  },
  {
    name: 'borrar_asignatura',
    description: 'Borra una asignatura y TODOS sus eventos. Pide confirmación al usuario antes.',
    parametersJsonSchema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  },
  {
    name: 'crear_evento',
    description: 'Guarda un examen, práctica de laboratorio, entrega, clase u otro evento con fecha. Los exámenes y entregas generan avisos automáticos.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        asignatura: { type: 'string', description: 'Asignatura a la que pertenece (se crea si no existe). Vacío si no es de ninguna.' },
        tipo: { type: 'string', enum: TIPOS_EVENTO },
        titulo: { type: 'string', description: 'Ej: "Parcial 1 (temas 1-4)", "Práctica 3: osciloscopio".' },
        inicio: fecha('Fecha/hora de inicio'),
        fin: fecha('Fecha/hora de fin (opcional)'),
        lugar: { type: 'string' },
        notas: { type: 'string', description: 'Material necesario, temario, % de nota...' },
        repetir_semanal_hasta: fecha('Si se repite cada semana (p. ej. prácticas todos los martes), último día. Opcional'),
      },
      required: ['tipo', 'titulo', 'inicio'],
    },
  },
  {
    name: 'buscar_eventos',
    description: 'Busca eventos guardados. Todos los filtros son opcionales.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        asignatura: { type: 'string' },
        tipo: { type: 'string', enum: TIPOS_EVENTO },
        desde: fecha('Desde'),
        hasta: fecha('Hasta (incluido)'),
        texto: { type: 'string', description: 'Texto a buscar en título, notas o lugar.' },
      },
    },
  },
  {
    name: 'modificar_evento',
    description: 'Cambia datos de un evento existente por su id. Solo cambia los campos que pases.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        asignatura: { type: 'string' },
        tipo: { type: 'string', enum: TIPOS_EVENTO },
        titulo: { type: 'string' },
        inicio: fecha('Nueva fecha de inicio'),
        fin: fecha('Nueva fecha de fin'),
        lugar: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['id'],
    },
  },
  { name: 'borrar_evento', description: 'Borra un evento por su id.', parametersJsonSchema: soloId },
  {
    name: 'crear_recordatorio',
    description: 'Programa un recordatorio para el usuario en una fecha y hora.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto del recordatorio, como se lo dirías al usuario. Empieza con un emoji.' },
        cuando: fecha('Cuándo avisar'),
        repetir: { type: 'string', enum: ['diario', 'semanal', 'mensual'], description: 'Opcional.' },
      },
      required: ['texto', 'cuando'],
    },
  },
  {
    name: 'ver_recordatorios',
    description: 'Lista los recordatorios pendientes (los del usuario y los avisos automáticos de exámenes).',
    parametersJsonSchema: { type: 'object', properties: { incluir_automaticos: { type: 'boolean' } } },
  },
  { name: 'borrar_recordatorio', description: 'Borra un recordatorio por id.', parametersJsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'memorizar',
    description: 'Guarda en la memoria permanente un dato suelto que el usuario quiere recordar (no contraseñas ni datos bancarios). Ej: "mi tutor es Luis".',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'El dato, redactado de forma completa y que se entienda solo.' },
        etiquetas: { type: 'string', description: 'Palabras clave separadas por comas.' },
      },
      required: ['texto'],
    },
  },
  { name: 'buscar_memoria', description: 'Busca en la memoria permanente. Sin texto devuelve todo.', parametersJsonSchema: { type: 'object', properties: { texto: { type: 'string' } } } },
  {
    name: 'modificar_memoria',
    description: 'Corrige un dato de la memoria por id.',
    parametersJsonSchema: { type: 'object', properties: { id: { type: 'integer' }, texto: { type: 'string' }, etiquetas: { type: 'string' } }, required: ['id'] },
  },
  { name: 'olvidar', description: 'Borra un dato de la memoria por id.', parametersJsonSchema: soloId },
  { name: 'leer_documento', description: 'Devuelve el contenido completo de un documento añadido por el usuario.', parametersJsonSchema: soloId },
  {
    name: 'buscar_en_documentos',
    description: 'Busca un texto exacto dentro de todos los documentos añadidos y devuelve los fragmentos donde aparece.',
    parametersJsonSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
];

declaraciones.push(
  {
    name: 'crear_clase',
    description: 'Añade una clase al horario semanal (se repite cada semana). Si la misma clase es varios días, pásalos en "dias".',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        asignatura: { type: 'string' },
        dias: { type: 'array', items: DIA, description: 'Días de la semana en que hay esta clase.' },
        inicio: hora('Hora de inicio'),
        fin: hora('Hora de fin'),
        aula: { type: 'string', description: 'Número o nombre del aula/laboratorio.' },
        tipo: { type: 'string', enum: TIPOS_CLASE, description: 'teoria, laboratorio, practicas (de ordenador/problemas), seminario u otro.' },
        grupo: { type: 'string' },
        desde: fecha('Primer día en que hay esta clase (opcional)'),
        hasta: fecha('Último día en que hay esta clase (opcional)'),
        notas: { type: 'string' },
      },
      required: ['asignatura', 'dias', 'inicio', 'fin'],
    },
  },
  { name: 'ver_horario', description: 'Devuelve el horario semanal completo.', parametersJsonSchema: { type: 'object', properties: {} } },
  {
    name: 'ver_clases_dia',
    description: 'Clases de una fecha concreta, con los cambios de ese día aplicados (laboratorio en vez de teoría, otra aula, cancelada...).',
    parametersJsonSchema: { type: 'object', properties: { fecha: fecha('Fecha') }, required: ['fecha'] },
  },
  {
    name: 'modificar_clase',
    description: 'Cambia una clase del horario PARA TODAS LAS SEMANAS. Para un solo día usa cambiar_clase_un_dia.',
    parametersJsonSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, asignatura: { type: 'string' }, dia: DIA, inicio: hora('Inicio'), fin: hora('Fin'), aula: { type: 'string' }, tipo: { type: 'string', enum: TIPOS_CLASE }, grupo: { type: 'string' }, desde: fecha('Desde'), hasta: fecha('Hasta'), notas: { type: 'string' } },
      required: ['id'],
    },
  },
  { name: 'borrar_clase', description: 'Quita una clase del horario semanal.', parametersJsonSchema: soloId },
  {
    name: 'cambiar_clase_un_dia',
    description: 'Cambio SOLO para una fecha: p. ej. ese día toca laboratorio en vez de teoría, cambia el aula, la hora o se cancela. Con clase_id modifica esa clase ese día; sin clase_id crea una clase extra ese día (requiere asignatura, inicio y fin).',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        fecha: fecha('Fecha concreta'),
        clase_id: { type: 'integer', description: 'Id de la clase del horario (opcional).' },
        asignatura: { type: 'string', description: 'Solo para clases extra.' },
        tipo: { type: 'string', enum: TIPOS_CLASE },
        aula: { type: 'string' },
        inicio: hora('Inicio'),
        fin: hora('Fin'),
        cancelada: { type: 'boolean' },
        nota: { type: 'string', description: 'Ej: "traer bata", "examen parcial en clase".' },
      },
      required: ['fecha'],
    },
  },
  { name: 'quitar_cambio_clase', description: 'Deshace un cambio de un día concreto (o borra una clase extra) por su id de cambio.', parametersJsonSchema: soloId },
  {
    name: 'crear_nota',
    description: 'Crea una nota en el apartado Notas del usuario (apuntes, ideas, listas, cosas concretas que quiere apuntar).',
    parametersJsonSchema: {
      type: 'object',
      properties: { titulo: { type: 'string' }, texto: { type: 'string' }, asignatura: { type: 'string', description: 'Opcional.' }, fijada: { type: 'boolean' } },
      required: ['texto'],
    },
  },
  {
    name: 'buscar_notas',
    description: 'Busca en las notas del usuario.',
    parametersJsonSchema: { type: 'object', properties: { texto: { type: 'string' }, asignatura: { type: 'string' } } },
  },
  {
    name: 'modificar_nota',
    description: 'Cambia una nota por id. Con anadir=true el texto se añade al final en vez de sustituirlo.',
    parametersJsonSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, titulo: { type: 'string' }, texto: { type: 'string' }, anadir: { type: 'boolean' }, asignatura: { type: 'string' }, fijada: { type: 'boolean' } },
      required: ['id'],
    },
  },
  { name: 'borrar_nota', description: 'Borra una nota por id. Pide confirmación antes.', parametersJsonSchema: soloId },
  {
    name: 'guardar_calificacion',
    description:
      'Calculadora de notas: crea o actualiza una parte de la evaluación de una asignatura (p. ej. "Examen final" 60%, "Prácticas" 30%) y/o la nota sacada (0-10). Si ya existe una parte con ese nombre, la actualiza.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        asignatura: { type: 'string' },
        nombre: { type: 'string', description: 'Nombre de la parte: "Parcial 1", "Laboratorio", "Examen final"...' },
        peso: { type: 'number', description: 'Porcentaje de la nota final (0-100).' },
        nota: { type: 'number', description: 'Nota obtenida sobre 10. Omitir si aún no la tiene.' },
        nota_minima: { type: 'number', description: 'Nota mínima exigida en esa parte para poder aprobar (opcional).' },
        id: { type: 'integer', description: 'Id de la parte, si se conoce.' },
      },
      required: ['asignatura'],
    },
  },
  {
    name: 'ver_calificaciones',
    description: 'Calcula para cada asignatura: lo que lleva, su media, y qué nota necesita en lo que le falta para aprobar o llegar a su objetivo.',
    parametersJsonSchema: { type: 'object', properties: { asignatura: { type: 'string' } } },
  },
  { name: 'borrar_calificacion', description: 'Borra una parte de la evaluación por id.', parametersJsonSchema: soloId },
  {
    name: 'registrar_falta_laboratorio',
    description: 'Apunta una falta a una clase de LABORATORIO de una asignatura en una fecha.',
    parametersJsonSchema: {
      type: 'object',
      properties: { asignatura: { type: 'string' }, fecha: fecha('Día de la falta'), nota: { type: 'string', description: 'Motivo (opcional).' } },
      required: ['asignatura', 'fecha'],
    },
  },
  {
    name: 'ver_faltas_laboratorio',
    description: 'Faltas de laboratorio de una asignatura: cuántas lleva, el máximo y cuántas le quedan.',
    parametersJsonSchema: { type: 'object', properties: { asignatura: { type: 'string' } }, required: ['asignatura'] },
  },
  { name: 'quitar_falta', description: 'Borra una falta de laboratorio por id.', parametersJsonSchema: soloId },
  {
    name: 'crear_tarea',
    description: 'Añade una tarea a la lista de tareas (cosas por hacer: imprimir, pedir revisión, comprar material...).',
    parametersJsonSchema: {
      type: 'object',
      properties: { texto: { type: 'string' }, fecha: fecha('Fecha límite (opcional)'), prioridad: { type: 'string', enum: PRIORIDADES }, asignatura: { type: 'string' } },
      required: ['texto'],
    },
  },
  {
    name: 'ver_tareas',
    description: 'Lista las tareas pendientes ordenadas por fecha y prioridad.',
    parametersJsonSchema: { type: 'object', properties: { incluir_hechas: { type: 'boolean' } } },
  },
  {
    name: 'modificar_tarea',
    description: 'Cambia una tarea o la marca como hecha (hecha=true).',
    parametersJsonSchema: {
      type: 'object',
      properties: { id: { type: 'integer' }, texto: { type: 'string' }, fecha: fecha('Fecha límite'), prioridad: { type: 'string', enum: PRIORIDADES }, asignatura: { type: 'string' }, hecha: { type: 'boolean' } },
      required: ['id'],
    },
  },
  { name: 'borrar_tarea', description: 'Borra una tarea por id.', parametersJsonSchema: soloId },
);

export async function ejecutar(datos, nombre, a = {}) {
  a ||= {};
  try {
    switch (nombre) {
      case 'guardar_asignatura': return await datos.guardarAsignatura(a);
      case 'ver_asignaturas': return datos.verAsignaturas(a.nombre);
      case 'borrar_asignatura': return await datos.borrarAsignatura(a.nombre);
      case 'crear_evento': return await datos.crearEvento(a);
      case 'buscar_eventos': return datos.buscarEventos(a);
      case 'modificar_evento': return await datos.modificarEvento(a);
      case 'borrar_evento': return await datos.borrarEvento(a.id);
      case 'crear_recordatorio': return await datos.crearRecordatorio(a);
      case 'ver_recordatorios': return datos.verRecordatorios(a);
      case 'borrar_recordatorio': return await datos.borrarRecordatorio(a.id);
      case 'memorizar': return await datos.memorizar(a);
      case 'buscar_memoria': return datos.buscarMemoria(a.texto);
      case 'modificar_memoria': return await datos.modificarMemoria(a);
      case 'olvidar': return await datos.olvidar(a.id);
      case 'leer_documento': return datos.leerDocumento(a.id);
      case 'buscar_en_documentos': return datos.buscarEnDocumentos(a.texto);
      case 'crear_clase': return await datos.crearClase(a);
      case 'ver_horario': return datos.verHorario();
      case 'ver_clases_dia': return datos.clasesDelDia(String(a.fecha).slice(0, 10));
      case 'modificar_clase': return await datos.modificarClase(a);
      case 'borrar_clase': return await datos.borrarClase(a.id);
      case 'cambiar_clase_un_dia': return await datos.cambiarClaseDia(a);
      case 'quitar_cambio_clase': return await datos.borrarCambioClase(a.id);
      case 'crear_nota': return await datos.crearNota(a);
      case 'buscar_notas': return datos.buscarNotas(a);
      case 'modificar_nota': return await datos.modificarNota(a);
      case 'borrar_nota': return await datos.borrarNota(a.id);
      case 'guardar_calificacion': return await datos.guardarCalificacion(a);
      case 'ver_calificaciones': return datos.verCalificaciones(a.asignatura).map(({ partes, ...r }) => ({ ...r, partes: partes.map(({ asignaturaId, ...p }) => p) }));
      case 'borrar_calificacion': return await datos.borrarCalificacion(a.id);
      case 'registrar_falta_laboratorio': {
        const r = await datos.registrarFalta(a);
        delete r.lista;
        return r;
      }
      case 'ver_faltas_laboratorio': {
        const asig = datos.buscarAsignatura(a.asignatura);
        if (!asig) return { ok: false, error: `No encuentro la asignatura "${a.asignatura}"` };
        const { lista, ...r } = datos.resumenFaltas(asig.id);
        return { ...r, ids: lista.map((f) => ({ id: f.id, fecha: f.fecha })) };
      }
      case 'quitar_falta': return await datos.quitarFalta(a.id);
      case 'crear_tarea': return await datos.crearTarea(a);
      case 'ver_tareas': return datos.verTareas(a);
      case 'modificar_tarea': return await datos.modificarTarea(a);
      case 'borrar_tarea': return await datos.borrarTarea(a.id);
      default: return { ok: false, error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
