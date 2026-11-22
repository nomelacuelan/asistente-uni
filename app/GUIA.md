# Asistente Uni: guía

Una app para el móvil con:
- **🏠 Hoy**: tu próximo examen, tus clases del día (o de mañana) y avisos.
- **🗓️ Horario**: tus clases de la semana con el aula y si son de teoría, laboratorio o prácticas. Puedes cambiar un día concreto (por ejemplo, ese día toca laboratorio en otra aula, o se cancela).
- **💬 Chat** con IA: pregúntale o cuéntale cosas para que las guarde. Admite fotos y PDF.
- **📅 Agenda**: exámenes, prácticas y entregas; asignaturas (con su examen final de laboratorio); avisos y memoria.
- **☰ Más**:
  - **📝 Notas**, para apuntar cosas concretas.
  - **➕ Añadir información** (escribir, web, archivos, imágenes).
  - **⚙️ Ajustes**: modo claro u oscuro, clave de IA, avisos y copias de seguridad.

**Gratis**: sin suscripciones ni tarjeta. **Tus datos se guardan en tu móvil.**

---

# Parte 1. Subir la app a internet (una vez, 15 minutos, desde el ordenador)

Para instalarla, la app tiene que estar en una dirección web. GitHub Pages lo hace gratis y sin tarjeta.

1. Crea una cuenta en **https://github.com/signup** (gratis, solo email).
2. Arriba a la derecha: **＋ → New repository**.
   - **Repository name:** `asistente-uni`
   - Marca **Public** y pulsa **Create repository**.
3. En el repositorio nuevo, pulsa **uploading an existing file**.
4. Abre la carpeta `app` en tu Mac. Selecciona **todo lo que hay dentro** (`index.html`, `manifest.webmanifest`, `sw.js` y las carpetas `css`, `js` e `iconos`) y arrástralo a la página. Espera a que se suban y pulsa **Commit changes**.
5. **Settings → Pages** (menú de la izquierda):
   - En **Source** elige **Deploy from a branch**.
   - En **Branch** elige **main** y **/ (root)**, y pulsa **Save**.
6. Espera 1 o 2 minutos y recarga. Arriba sale tu dirección:
   **`https://TU-USUARIO.github.io/asistente-uni/`**. Apúntala o mándatela por WhatsApp para abrirla en el móvil.

> El código queda público, pero tus datos no: se guardan solo en tu móvil. Tu clave de IA tampoco se sube.

**Si ya la habías subido antes**, entra en tu repositorio, pulsa **Add file → Upload files**, arrastra otra vez todo el contenido de la carpeta `app` y pulsa **Commit changes**. GitHub sustituye los archivos antiguos.

---

# Parte 2. Descargarla en tu Android (2 minutos)

1. En el móvil, abre **Google Chrome**. Tiene que ser Chrome, no el navegador de Samsung ni otro.
2. Escribe o pega tu dirección: `https://TU-USUARIO.github.io/asistente-uni/`
3. Espera a que cargue la app (verás la pantalla **Hoy**).
4. Toca el menú **⋮** (tres puntos, arriba a la derecha).
5. Toca **Instalar aplicación**. Si no aparece, toca **Añadir a pantalla de inicio → Instalar**.
6. Confirma con **Instalar**. En unos segundos aparece el icono verde 🎓 **Asistente Uni** en tu pantalla de inicio y en el cajón de aplicaciones, como cualquier otra app.
7. Ábrela **siempre desde el icono**, no desde Chrome. Se abre a pantalla completa, sin barra del navegador.

**Truco:** si mantienes pulsado el icono, salen accesos directos a Horario, Chat, Notas y Añadir.

**Si no sale "Instalar aplicación":** recarga la página, espera unos segundos y vuelve a mirar el menú ⋮. Comprueba también que la dirección empieza por `https://`.

## Activar la IA (gratis)
1. En el móvil, entra en **https://aistudio.google.com/apikey** con tu cuenta de Google.
2. Pulsa **Create API key** y **cópiala**.
3. En la app: **☰ Más → ⚙️ Ajustes**. Pégala en **Clave de IA** y pulsa **Probar**. Debe salir "✅ ¡Funciona!".

## Elegir modo claro u oscuro
**☰ Más → ⚙️ Ajustes → 🎨 Apariencia**: **📱 Automático** (como tu móvil), **☀️ Claro** u **🌙 Oscuro**.

---

# Parte 3. Darle toda tu información (al empezar el cuatrimestre)

## Paso 1. Tu horario de clases
Elige la forma que prefieras:
- **Con una foto (lo más rápido):** haz una captura o foto de tu horario. Ve a **☰ Más → ➕ Añadir → 🖼️ Imagen** (o mándala al **💬 Chat** con 📎) y escribe: *"este es mi horario, guarda todas las clases"*.
- **A mano:** en **🗓️ Horario** toca **＋ Añadir clase**. Rellena:
  - asignatura;
  - días (puedes marcar varios: L, X…);
  - hora de inicio y de fin;
  - **aula o nº de clase**;
  - **tipo**: 📖 Teoría, 🧪 Laboratorio, 💻 Prácticas o 👥 Seminario.

**Cuando un día concreto es distinto** (toca laboratorio en vez de teoría, cambia el aula o no hay clase):
- En **🗓️ Horario**, ve a ese día con las flechas ‹ › y toca la clase.
- Toca **✏️ Cambiar solo este día**. Elige qué toca ese día, el aula y una nota (por ejemplo, *"traer bata"*), o marca **Se cancela este día**.
- Las demás semanas no cambian.
- También puedes decírselo al chat: *"el lunes 1 de diciembre la clase de Física es de laboratorio en el L2"*.
- Para una clase que no está en tu horario habitual (recuperación, laboratorio suelto), usa **＋ Clase solo un día**.

## Paso 2. Exámenes, prácticas y asignaturas
Ve a **☰ Más → ➕ Añadir** (con la casilla "Pasar a la agenda…" marcada):
- **📄 Archivo:** el PDF del **calendario de exámenes** y las **guías docentes**.
- **🔗 Web:** el enlace de la página de exámenes de tu titulación (tiene que ser pública).
- **✍️ Escribir:** lo que sepas de cada asignatura, por ejemplo:

```
Física II. Profesora: Ana Ruiz.
Examen final: 15 de enero a las 9:00, aula 2.3
Parcial: 20 de noviembre, temas 1 a 4
Tiene examen final de laboratorio el 18 de diciembre
Nota: 70% examen, 30% laboratorio
```

Después de cada uno, **lee el resumen** de lo que ha guardado. Si algo está mal, corrígelo en 📅 Agenda o díselo al chat.

## Paso 3. Comprueba
- **🗓️ Horario → Semana**: toda la semana de un vistazo.
- **📅 Agenda → Asignaturas**: cada una muestra **🧪 Final de lab: sí/no** y su próximo examen.
- **💬 Chat**: *"¿qué clase tengo mañana a las 9 y en qué aula?"*, *"¿qué asignaturas tienen examen final de laboratorio?"*.

---

# Parte 4. Usarla en el día a día

| Quiero… | Dónde |
|---|---|
| Ver mis clases de hoy y el próximo examen | 🏠 **Hoy** |
| Ver qué toca un día y en qué aula | 🗓️ **Horario** |
| Apuntar algo concreto | ☰ Más → 📝 **Notas → ＋ Nota**, o en el chat: *"apunta que…"* |
| Buscar una nota | 📝 Notas → buscador, o filtra por asignatura |
| Preguntar algo | 💬 **Chat** |
| Hablar en vez de escribir | 💬 Chat → **🎤 micrófono del teclado** |
| Guardar una foto de la pizarra o del tablón | 💬 Chat → 📎 → Hacer foto |
| Que me recuerde algo | 💬 *"recuérdame mañana a las 8 llevar la bata"* |

## ⚠️ Avisos con la app cerrada
La app no puede mandar notificaciones estando cerrada (eso necesitaría un servidor de pago). La solución gratis es **pasar los exámenes y recordatorios al calendario del móvil**, que sí avisa siempre:
- Toca un examen → **📅 Añadir al calendario del móvil → Google Calendar** → **Guardar**.
- Al crear un recordatorio, la app te ofrece pasarlo al calendario.
- Al abrir la app, **🏠 Hoy** te muestra los avisos pendientes.

## Copias de seguridad
Tus datos están solo en el móvil. Si desinstalas la app o borras los datos de Chrome, se pierden, salvo que tengas copia.
- **☰ Más → ⚙️ Ajustes → ⬇️ Hacer copia**: guárdala en Google Drive o mándatela por email cada pocas semanas.
- **⬆️ Restaurar copia** para recuperarlos (también en otro móvil).

## Límites del plan gratuito
- La IA gratuita tiene un máximo de peticiones por minuto y por día. Si lo alcanzas, la app te lo dice; espera un poco.
- Con el plan gratuito, Google puede usar lo que envías a la IA para mejorar sus productos. No mandes datos muy privados.
- Sin internet puedes ver tu horario, agenda y notas, pero el chat y la lectura de documentos no funcionan.
