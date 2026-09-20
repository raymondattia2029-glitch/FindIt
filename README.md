# FindIt 🔎

MVP de objetos perdidos y encontrados para estudiantes de una escuela.

## Cómo correrlo localmente

**Requisito:** tener [Node.js](https://nodejs.org) instalado (versión 16 o más reciente).

1. Descomprime la carpeta `findit`.
2. Abre una terminal dentro de esa carpeta.
3. Instala las dependencias:
   ```
   npm install
   ```
4. Inicia el servidor:
   ```
   npm start
   ```
5. Abre en tu navegador: **http://localhost:3000**
   (para probarlo como si fuera móvil, usa las herramientas de desarrollador del navegador y activa la vista de celular, o ábrelo directamente desde el celular usando la IP de tu computadora en la misma red, ej. `http://192.168.1.X:3000`)

No necesitas crear cuentas, configurar variables de entorno ni conectar ningún servicio externo. Todo corre localmente.

## Cómo está guardada la información

Los objetos y mensajes se guardan en `db.json`, un archivo de texto simple en la misma carpeta. No hay base de datos externa (ni Supabase ni Firebase) — así el MVP es instantáneo de correr. Si más adelante quieres múltiples dispositivos compartiendo datos en tiempo real desde distintas redes, ese es el momento de migrar `db.json` a algo como Supabase o Firebase; el código de `server.js` está organizado para que ese cambio sea sencillo (solo reemplazarías las funciones `readDB` / `writeDB`).

Las fotos se guardan en la carpeta `uploads/`.

## Cómo funciona el matching (coincidencias)

Cuando alguien publica un objeto, el sistema compara automáticamente su nombre, descripción y lugar contra todos los objetos del tipo opuesto (perdido ↔ encontrado), usando una similitud de palabras (sin IA, sin depender de internet). Si la similitud es de 30% o más, se muestra como "🟢 Posible coincidencia".

Este algoritmo está en la función `matchScore()` dentro de `server.js`, con un comentario que indica exactamente dónde podrías conectar una API de IA (por ejemplo, para comparar descripciones de forma más inteligente) si más adelante quieres mejorarlo. La app funciona completa sin esa API.

## Privacidad

No se pide ni se muestra teléfono, correo ni redes sociales de nadie — solo el nombre que cada estudiante escribe al crear su cuenta, para que se sepa quién perdió o encontró cada objeto. El chat de "Contactar" solo funciona dentro de la app, asociado al reporte.

## Cuentas y notificaciones

Cada estudiante crea una cuenta simple (nombre, usuario, contraseña) para poder publicar objetos. Así, cada objeto muestra quién lo perdió o quién lo encontró.

Cuando alguien publica un objeto que se parece a uno ya perdido, la persona que lo perdió recibe una notificación (ícono de campana 🔔 en la parte de arriba, con un contador de no leídas). Al tocarla, la lleva directo al detalle de su objeto para ver la posible coincidencia.

Solo el dueño de un reporte puede marcarlo como "✅ Ya lo recuperé" / "✅ Ya se lo llevaron" — al hacerlo, desaparece del buscador.

## Estructura del proyecto

```
findit/
├── package.json      # dependencias
├── server.js         # backend (API + matching)
├── db.json           # "base de datos" en JSON
├── uploads/           # fotos subidas
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
5. Cierra sesión y vuelve a entrar como María — deberías ver un número en la campana 🔔 con la notificación de que alguien encontró algo parecido.
6. Ve a "Buscar objetos" y busca "botella" — verás quién lo publicó.
7. Como María, abre tu objeto perdido y presiona "✅ Ya lo recuperé" — debería desaparecer del buscador.
8. Cierra el servidor y vuelve a iniciarlo (`npm start`) — los datos siguen ahí porque están en `db.json`.

## Siguientes mejoras posibles (no incluidas en este MVP a propósito)

- Notificaciones automáticas cuando aparece una coincidencia nueva.
- Migrar `db.json` a Supabase/Firebase si se necesita acceso desde muchos dispositivos en redes distintas al mismo tiempo.
- Mejorar el matching con una API de IA para comparar descripciones de forma semántica.
