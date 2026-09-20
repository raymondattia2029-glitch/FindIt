// FindIt — servidor MVP
// Express + db.js (JSON local o Postgres/Supabase según DATABASE_URL).

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname + '/public'));

// Las fotos se guardan como texto (base64) dentro de la base de datos,
// no como archivos — así funcionan igual en local y una vez publicada
// la app (los servicios de hosting gratis no guardan archivos entre
// reinicios, pero sí lo que está en la base de datos).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

// ---------- Autenticación (muy simple, sin librerías externas) ----------
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
}
function newId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.round(Math.random() * 1e6);
}
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'No has iniciado sesión' });
  const user = await db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Sesión inválida, inicia sesión de nuevo' });
  req.user = user;
  next();
}

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username };
}

app.post('/api/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Escribe tu nombre' });
    if (!username || !username.trim()) return res.status(400).json({ error: 'Escribe un usuario' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });

    const usernameNorm = username.trim().toLowerCase();
    if (await db.getUserByUsername(usernameNorm)) {
      return res.status(400).json({ error: 'Ese usuario ya existe, elige otro' });
    }

    const salt = crypto.randomBytes(8).toString('hex');
    const user = {
      id: newId('user'),
      name: name.trim(),
      username: usernameNorm,
      salt,
      passwordHash: hashPassword(password, salt),
      token: newToken(),
      createdAt: Date.now(),
    };
    await db.createUser(user);
    res.json({ token: user.token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const usernameNorm = (username || '').trim().toLowerCase();
    const user = await db.getUserByUsername(usernameNorm);
    if (!user || hashPassword(password || '', user.salt) !== user.passwordHash) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const token = newToken();
    await db.updateUserToken(user.id, token);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Utilidades de texto / similitud ----------
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'con', 'en',
  'y', 'del', 'al', 'para', 'que', 'se', 'su', 'sus', 'lo', 'a', 'es', 'por',
]);

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function words(str) {
  return normalize(str).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
function jaccard(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  return new Set([...a, ...b]).size === 0 ? 0 : intersection / new Set([...a, ...b]).size;
}

// NOTA: similitud simple por palabras (sin IA). Si más adelante quieres
// mejorarlo con IA, aquí es el lugar ideal para llamar a una API externa
// y combinar ese puntaje con el de abajo. La app funciona completa sin eso.
function matchScore(itemA, itemB) {
  const textA = words(`${itemA.nombre} ${itemA.descripcion || ''}`);
  const textB = words(`${itemB.nombre} ${itemB.descripcion || ''}`);
  const lugarA = words(itemA.lugar || '');
  const lugarB = words(itemB.lugar || '');
  const textScore = jaccard(textA, textB);
  const lugarScore = jaccard(lugarA, lugarB);

  const nameA = normalize(itemA.nombre);
  const nameB = normalize(itemB.nombre);
  const fullB = normalize(`${itemB.nombre} ${itemB.descripcion || ''}`);
  const fullA = normalize(`${itemA.nombre} ${itemA.descripcion || ''}`);
  const substringBonus =
    (nameA && fullB.includes(nameA)) || (nameB && fullA.includes(nameB)) ? 0.25 : 0;

  return Math.round(Math.min(textScore * 0.65 + lugarScore * 0.2 + substringBonus, 1) * 100) / 100;
}

function findMatchesFor(item, allItems) {
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';
  return allItems
    .filter((other) => other.type === oppositeType && !other.resolved && other.id !== item.id)
    .map((other) => ({ item: other, score: matchScore(item, other) }))
    .filter((m) => m.score >= 0.3)
    .sort((a, b) => b.score - a.score);
}

async function notifyMatches(newItem, matches) {
  for (const m of matches) {
    const lostItem = newItem.type === 'lost' ? newItem : m.item;
    const foundItem = newItem.type === 'found' ? newItem : m.item;
    if (lostItem.userId === foundItem.userId) continue;

    const already = await db.notificationExists(lostItem.userId, lostItem.id, foundItem.id);
    if (already) continue;

    await db.addNotification({
      id: newId('notif'),
      userId: lostItem.userId,
      lostItemId: lostItem.id,
      foundItemId: foundItem.id,
      text: `Alguien encontró algo parecido a "${lostItem.nombre}": "${foundItem.nombre}"`,
      read: false,
      createdAt: Date.now(),
    });
  }
}

async function withReporter(item) {
  const u = await db.getUserById(item.userId);
  return { ...item, reporterName: u ? u.name : 'Estudiante' };
}
async function withReporterMany(items) {
  return Promise.all(items.map(withReporter));
}

// ---------- Rutas API de objetos ----------

app.post('/api/items', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    const { type, nombre, descripcion, lugar } = req.body;
    if (!type || !['lost', 'found'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del objeto es obligatorio' });

    const foto = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null;

    const newItem = {
      id: newId('item'),
      type,
      nombre: nombre.trim(),
      descripcion: (descripcion || '').trim(),
      lugar: (lugar || '').trim(),
      foto,
      userId: req.user.id,
      createdAt: Date.now(),
      resolved: false,
    };
    await db.createItem(newItem);

    const allItems = await db.getAllItems();
    const matches = findMatchesFor(newItem, allItems);
    await notifyMatches(newItem, matches);

    res.json({
      item: await withReporter(newItem),
      matches: await Promise.all(matches.map(async (m) => ({ ...(await withReporter(m.item)), score: m.score }))),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al publicar' });
  }
});

app.post('/api/items/:id/resolve', requireAuth, async (req, res) => {
  const item = await db.getItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  if (item.userId !== req.user.id) return res.status(403).json({ error: 'Solo el dueño del reporte puede marcarlo' });
  await db.resolveItem(item.id);
  res.json({ ok: true });
});

app.get('/api/items', async (req, res) => {
  try {
    const { type, q } = req.query;
    let results = await db.listItems({ type, excludeResolved: true });

    if (q && q.trim()) {
      const queryWords = words(q);
      results = results
        .map((item) => {
          const itemWords = words(`${item.nombre} ${item.descripcion} ${item.lugar}`);
          const fullNormalized = normalize(`${item.nombre} ${item.descripcion} ${item.lugar}`);
          let hits = 0;
          queryWords.forEach((qw) => { if (itemWords.includes(qw) || fullNormalized.includes(qw)) hits++; });
          return { item, score: queryWords.length ? hits / queryWords.length : 0 };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item);
    }

    res.json(await withReporterMany(results));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor al buscar' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  const item = await db.getItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  const allItems = await db.getAllItems();
  const matches = findMatchesFor(item, allItems);
  res.json({
    item: await withReporter(item),
    matches: await Promise.all(matches.map(async (m) => ({ ...(await withReporter(m.item)), score: m.score }))),
  });
});

// ---------- Chat por objeto ----------
app.get('/api/items/:id/messages', async (req, res) => {
  const msgs = await db.listMessages(req.params.id);
  const withNames = await Promise.all(msgs.map(async (m) => {
    const u = await db.getUserById(m.userId);
    return { ...m, senderName: u ? u.name : 'Estudiante' };
  }));
  res.json(withNames);
});

app.post('/api/items/:id/messages', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
  const item = await db.getItemById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });

  const msg = { id: newId('msg'), itemId: req.params.id, userId: req.user.id, text: text.trim(), createdAt: Date.now() };
  await db.addMessage(msg);
  res.json({ ...msg, senderName: req.user.name });
});

// ---------- Notificaciones ----------
app.get('/api/notifications', requireAuth, async (req, res) => {
  res.json(await db.listNotifications(req.user.id));
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  await db.markNotificationRead(req.params.id, req.user.id);
  res.json({ ok: true });
});

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`FindIt corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('No se pudo iniciar la base de datos:', err.message);
  process.exit(1);
});
