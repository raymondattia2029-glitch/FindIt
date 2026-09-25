# FindIt 🔎

MVP de objetos perdidos y encontrados para estudiantes de una escuela.

## Cómo correrlo localmente (solo tú, para probar)

**Requisito:** tener [Node.js](https://nodejs.org) instalado.

1. Abre una terminal dentro de la carpeta `findit`.
2. Instala las dependencias:
   ```
   npm install
   ```
3. Inicia el servidor:
   ```
   npm start
   ```
4. Abre en tu navegador: **http://localhost:3000**

Así, sin configurar nada más, los datos se guardan en un archivo `db.json` en la misma carpeta. Perfecto para probar tú solo, pero **solo tu computadora puede abrir esa página**.

## Cómo publicarla en internet (para que cualquiera la use)

Para esto se necesitan 3 cuentas gratuitas:

1. **[Supabase](https://supabase.com)** — la base de datos real (para que los datos no se borren).
2. **[GitHub](https://github.com)** — donde sube el código.
3. **[Render](https://render.com)** — donde la app queda corriendo 24/7 con un link público.

### Paso 1: Supabase (base de datos)
1. Crea una cuenta gratis en supabase.com y crea un proyecto nuevo (te pedirá un nombre y una contraseña para la base de datos — guárdala).
2. Cuando el proyecto termine de crearse, ve a **Project Settings → Database**.
3. Copia la **Connection string** en modo "Connection pooling" (URI). Se ve algo así:
   ```
   postgresql://postgres.xxxx:[TU-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
4. Reemplaza `[TU-PASSWORD]` por la contraseña que pusiste al crear el proyecto. Guarda esa dirección completa — la vas a necesitar en el Paso 3.

No necesitas crear tablas a mano: la app las crea solas la primera vez que arranca.

### Paso 2: GitHub (subir el código)
1. Crea una cuenta gratis en github.com.
2. Crea un repositorio nuevo (botón "New repository"), por ejemplo llamado `findit`.
3. Usa la opción de subir archivos ("uploading an existing file") y arrastra todo el contenido de la carpeta `findit` (menos `node_modules` y `db.json`, si existen).

### Paso 3: Render (publicarla)
1. Crea una cuenta gratis en render.com (puedes entrar con tu cuenta de GitHub).
2. Click en **New → Web Service** y conecta el repositorio que acabas de subir.
3. Configura:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. En la sección **Environment Variables**, agrega una nueva:
   - Nombre: `DATABASE_URL`
   - Valor: la connection string de Supabase del Paso 1
5. Dale a **Create Web Service**. Después de unos minutos, Render te da un link público, algo como `https://findit-xxxx.onrender.com` — ese es el que puedes compartir con cualquiera.

**Nota:** el plan gratis de Render "duerme" la app si nadie la usa por un rato, así que la primera vez que alguien la abre después de un tiempo sin uso puede tardar unos 30-50 segundos en cargar. Es normal, no es que esté rota.

## Cómo está guardada la información

`db.js` decide solo dónde guardar los datos: si existe la variable `DATABASE_URL` (como en Render), usa esa base de datos Postgres de Supabase; si no existe (cuando corres `npm start` en tu computadora sin configurar nada), usa el archivo `db.json` local. No tienes que cambiar nada del código a mano para pasar de uno a otro.

Las fotos se guardan como texto (base64) directamente en la base de datos — así también sobreviven a que Render reinicie la app, sin necesitar un servicio de almacenamiento aparte.

## Cómo funciona el matching (coincidencias)

Cuando alguien publica un objeto, el sistema compara automáticamente su nombre, descripción y lugar contra todos los objetos del tipo opuesto (perdido ↔ encontrado), usando una similitud de palabras (sin IA, sin depender de internet). Si la similitud es de 30% o más, se muestra como "🟢 Posible coincidencia".

Este algoritmo está en la función `matchScore()` dentro de `server.js`, con un comentario que indica exactamente dónde podrías conectar una API de IA si más adelante quieres mejorarlo. La app funciona completa sin esa API.

## Cuentas y notificaciones

Cada estudiante crea una cuenta simple (nombre, usuario, contraseña) para poder publicar objetos. Así, cada objeto muestra quién lo perdió o quién lo encontró.

Cuando alguien publica un objeto que se parece a uno ya perdido, la persona que lo perdió recibe una notificación (ícono de campana 🔔 arriba, con contador de no leídas). Al tocarla, la lleva directo al detalle de su objeto para ver la posible coincidencia.

Solo el dueño de un reporte puede marcarlo como "✅ Ya lo recuperé" / "✅ Ya se lo llevaron" — al hacerlo, desaparece del buscador.

## Privacidad

No se pide ni se muestra teléfono, correo ni redes sociales de nadie — solo el nombre que cada estudiante escribe al crear su cuenta. El chat de "Contactar" solo funciona dentro de la app, asociado al reporte.

## Estructura del proyecto

```
findit/
├── package.json      # dependencias (express, multer, pg)
├── server.js         # backend: rutas de la API + matching
├── db.js             # capa de datos (JSON local o Postgres/Supabase)
├── db.json           # solo se usa en modo local (se crea solo)
└── public/
    ├── index.html     # la app (todas las pantallas)
    ├── style.css       # diseño mobile-first
    └── app.js          # lógica del frontend
```

## Qué probar primero

1. Crea una cuenta (nombre, usuario, contraseña) — por ejemplo "María".
2. Publica un objeto perdido, ej. "Botella azul", descripción "con stickers", lugar "Cafetería".
3. Cierra sesión y crea otra cuenta, ej. "Pedro".
4. Publica un objeto encontrado parecido: "Botella azul", "con varios stickers", "Cafetería". Debería aparecer "🟢 Posible coincidencia" al publicarlo.
5. Cierra sesión y vuelve a entrar como María — deberías ver un número en la campana 🔔 con la notificación.
6. Ve a "Buscar objetos" y busca "botella" — verás quién lo publicó.
7. Como María, abre tu objeto perdido y presiona "✅ Ya lo recuperé" — debería desaparecer del buscador.

## Siguientes mejoras posibles (no incluidas en este MVP a propósito)

- Notificaciones por correo o push (fuera del navegador).
- Mejorar el matching con una API de IA para comparar descripciones de forma semántica.
