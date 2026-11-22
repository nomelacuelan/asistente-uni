// Guarda todos tus datos en el propio móvil (IndexedDB). No se envían a ningún servidor propio.

export function estadoVacio() {
  return {
    version: 1,
    sigId: 1,
    asignaturas: [],
    eventos: [],
    recordatorios: [],
    avisosVistos: [], // ids de avisos automáticos ya marcados como vistos
    memoria: [],
    conocimiento: [],
    horario: [], // clases semanales
    cambiosClase: [], // cambios de un día concreto (laboratorio en vez de teoría, otra aula, cancelada, clase extra)
    notas: [],
    historial: [],
    ajustes: {
      apiKey: '',
      modelo: 'gemini-3.8-flash',
      avisosDias: [7, 3, 1],
      avisosHora: '09:00',
      resumenHora: '08:00',
      tema: 'auto', // 'auto' (según el móvil), 'claro' u 'oscuro'
    },
  };
}

/** Rellena campos que falten (por ejemplo, al importar una copia antigua). */
export function normalizarEstado(datos) {
  const base = estadoVacio();
  const e = { ...base, ...(datos || {}) };
  e.ajustes = { ...base.ajustes, ...(datos?.ajustes || {}) };
  for (const k of ['asignaturas', 'eventos', 'recordatorios', 'avisosVistos', 'memoria', 'conocimiento', 'horario', 'cambiosClase', 'notas', 'historial']) {
    if (!Array.isArray(e[k])) e[k] = [];
  }
  const maxId = Math.max(0, ...['asignaturas', 'eventos', 'recordatorios', 'memoria', 'conocimiento', 'horario', 'cambiosClase', 'notas'].flatMap((k) => e[k].map((x) => Number(x.id) || 0)));
  e.sigId = Math.max(Number(e.sigId) || 1, maxId + 1);
  return e;
}

/** Almacén genérico: `persistir` decide dónde se guarda (IndexedDB en el móvil, memoria en las pruebas). */
export function crearAlmacen(inicial, persistir = async () => {}) {
  const almacen = {
    estado: normalizarEstado(inicial),
    nuevoId() {
      return almacen.estado.sigId++;
    },
    async guardar() {
      await persistir(almacen.estado);
    },
    async reemplazar(datos) {
      almacen.estado = normalizarEstado(datos);
      await persistir(almacen.estado);
    },
  };
  return almacen;
}

// ---------- IndexedDB (solo en el navegador) ----------

const NOMBRE_DB = 'asistente-uni';
const TABLA = 'estado';
const CLAVE = 'principal';

function abrirIDB() {
  return new Promise((ok, mal) => {
    // Si otra ventana de la app tiene bloqueada la base de datos, no se queda esperando para siempre
    const limite = setTimeout(() => mal(new Error('BLOQUEADA')), 8000);
    const pet = indexedDB.open(NOMBRE_DB, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(TABLA);
    pet.onsuccess = () => {
      clearTimeout(limite);
      const db = pet.result;
      // Si otra ventana necesita actualizar la base de datos, esta la suelta en vez de bloquearla
      db.onversionchange = () => db.close();
      ok(db);
    };
    pet.onerror = () => {
      clearTimeout(limite);
      mal(pet.error);
    };
  });
}

export async function abrirAlmacenNavegador() {
  const db = await abrirIDB();
  const leido = await new Promise((ok, mal) => {
    const pet = db.transaction(TABLA).objectStore(TABLA).get(CLAVE);
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  });
  // Pide al navegador que no borre los datos aunque falte espacio
  navigator.storage?.persist?.().catch(() => {});
  return crearAlmacen(leido, (estado) =>
    new Promise((ok, mal) => {
      const tx = db.transaction(TABLA, 'readwrite');
      tx.objectStore(TABLA).put(structuredClone(estado), CLAVE);
      tx.oncomplete = () => ok();
      tx.onerror = () => mal(tx.error);
    }),
  );
}
