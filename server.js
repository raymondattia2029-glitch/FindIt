// FindIt — servidor MVP
// Express + un archivo JSON como base de datos. Sin servicios externos.

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- "Base de datos" (archivo JSON) ----------
function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);
  if (!db.users) db.users = [];
  if (!db.notifications) db.notifications = [];
  return db;
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

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

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'No has iniciado sesión' });
  const db = readDB();
  const user = db.users.find((u) => u.token === token);
  if (!user) return res.status(401).json({ error: 'Sesión inválida, inicia sesión de nuevo' });
  req.user = user;
  req.db = db;
  next();
}

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username };
}

app.post('/api/register', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Escribe tu nombre' });
  if (!username || !username.trim()) return res.status(400).json({ error: 'Escribe un usuario' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });

  const db = readDB();
  const usernameNorm = username.trim().toLowerCase();
  if (db.users.some((u) => u.username === usernameNorm)) {
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
  db.users.push(user);
  writeDB(db);
  res.json({ token: user.token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const usernameNorm = (username || '').trim().toLowerCase();
  const user = db.users.find((u) => u.username === usernameNorm);
  if (!user || hashPassword(password || '', user.salt) !== user.passwordHash) {
    return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
  }
  user.token = newToken();
  writeDB(db);
  res.json({ token: user.token, user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Subida de fotos ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'foto_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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
  return normalize(str)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function jaccard(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Puntaje de similitud entre un objeto perdido y uno encontrado.
// NOTA: esto es un algoritmo simple de similitud por palabras (sin IA).
// Si más adelante quieres mejorarlo con IA, este es el lugar ideal para
// llamar a una API externa y combinar ese puntaje con el de abajo.
// La app funciona completa sin esa API.
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

  let score = textScore * 0.65 + lugarScore * 0.2 + substringBonus;
  score = Math.min(score, 1);
  return Math.round(score * 100) / 100;
}

function findMatchesFor(item, allItems) {
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';
  return allItems
    .filter((other) => other.type === oppositeType && !other.resolved)
    .map((other) => ({ item: other, score: matchScore(item, other) }))
    .filter((m) => m.score >= 0.3)
    .sort((a, b) => b.score - a.score);
}

// Crea notificaciones para el dueño del objeto perdido cuando aparece un
// posible match nuevo (sin duplicar si ya existía esa notificación).
function notifyMatches(newItem, matches, db) {
  matches.forEach((m) => {
    const lostItem = newItem.type === 'lost' ? newItem : m.item;
    const foundItem = newItem.type === 'found' ? newItem : m.item;
    if (lostItem.userId === foundItem.userId) return; // no notificarse a sí mismo

    const already = db.notifications.some(
      (n) => n.userId === lostItem.userId && n.lostItemId === lostItem.id && n.foundItemId === foundItem.id
    );
    if (already) return;

    db.notifications.push({
      id: newId('notif'),
      userId: lostItem.userId,
      lostItemId: lostItem.id,
      foundItemId: foundItem.id,
      text: `Alguien encontró algo parecido a "${lostItem.nombre}": "${foundItem.nombre}"`,
      read: false,
      createdAt: Date.now(),
    });
  });
}

function withReporter(item, db) {
  const u = db.users.find((x) => x.id === item.userId);
  return { ...item, reporterName: u ? u.name : 'Estudiante' };
}

// ---------- Rutas API de objetos ----------

app.post('/api/items', requireAuth, upload.single('foto'), (req, res) => {
  const { type, nombre, descripcion, lugar } = req.body;
  if (!type || !['lost', 'found'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del objeto es obligatorio' });
  }

  const db = req.db;
  const newItem = {
    id: newId('item'),
    type,
    nombre: nombre.trim(),
    descripcion: (descripcion || '').trim(),
    lugar: (lugar || '').trim(),
    foto: req.file ? '/uploads/' + req.file.filename : null,
    userId: req.user.id,
    createdAt: Date.now(),
    resolved: false,
  };
  db.items.push(newItem);

  const matches = findMatchesFor(newItem, db.items);
  notifyMatches(newItem, matches, db);
  writeDB(db);

  res.json({
    item: withReporter(newItem, db),
    matches: matches.map((m) => ({ ...withReporter(m.item, db), score: m.score })),
  });
});

app.post('/api/items/:id/resolve', requireAuth, (req, res) => {
  const db = req.db;
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  if (item.userId !== req.user.id) return res.status(403).json({ error: 'Solo el dueño del reporte puede marcarlo' });
  item.resolved = true;
  writeDB(db);
  res.json({ item });
});

app.get('/api/items', (req, res) => {
  const db = readDB();
  const { type, q } = req.query;
  let results = db.items.filter((i) => !i.resolved);

  if (type && ['lost', 'found'].includes(type)) {
    results = results.filter((i) => i.type === type);
  }

  if (q && q.trim()) {
    const queryWords = words(q);
    results = results
      .map((item) => {
        const itemWords = words(`${item.nombre} ${item.descripcion} ${item.lugar}`);
        const fullNormalized = normalize(`${item.nombre} ${item.descripcion} ${item.lugar}`);
        let hits = 0;
        queryWords.forEach((qw) => {
          if (itemWords.includes(qw) || fullNormalized.includes(qw)) hits++;
        });
        const score = queryWords.length ? hits / queryWords.length : 0;
        return { item, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  } else {
    results = [...results].sort((a, b) => b.createdAt - a.createdAt);
  }

  res.json(results.map((item) => withReporter(item, db)));
});

app.get('/api/items/:id', (req, res) => {
  const db = readDB();
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  const matches = findMatchesFor(item, db.items);
  res.json({
    item: withReporter(item, db),
    matches: matches.map((m) => ({ ...withReporter(m.item, db), score: m.score })),
  });
});

// ---------- Chat por objeto ----------
app.get('/api/items/:id/messages', (req, res) => {
  const db = readDB();
  const msgs = db.messages.filter((m) => m.itemId === req.params.id);
  res.json(msgs.map((m) => {
    const u = db.users.find((x) => x.id === m.userId);
    return { ...m, senderName: u ? u.name : 'Estudiante' };
  }));
});

app.post('/api/items/:id/messages', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

  const db = req.db;
  const item = db.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });

  const msg = {
    id: newId('msg'),
    itemId: req.params.id,
    userId: req.user.id,
    text: text.trim(),
    createdAt: Date.now(),
  };
  db.messages.push(msg);
  writeDB(db);
  res.json({ ...msg, senderName: req.user.name });
});

// ---------- Notificaciones ----------
app.get('/api/notifications', requireAuth, (req, res) => {
  const db = req.db;
  const list = db.notifications
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const db = req.db;
  const n = db.notifications.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (n) { n.read = true; writeDB(db); }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`FindIt corriendo en http://localhost:${PORT}`);
});
