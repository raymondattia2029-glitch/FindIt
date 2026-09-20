// db.js — capa de datos de FindIt.
//
// Si existe la variable de entorno DATABASE_URL, se conecta a esa base de
// datos Postgres (por ejemplo, Supabase) y crea las tablas automáticamente
// si no existen. Si NO existe esa variable, usa un archivo db.json local
// (para probar en tu computadora sin configurar nada).

const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, 'db.json');
const USING_PG = !!process.env.DATABASE_URL || !!process.env.PGHOST;

let pool;
if (USING_PG) {
  const { Pool } = require('pg');
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  } else {
    // Variables separadas — más fácil de configurar sin errores de copiado
    // que armar una sola URL larga a mano.
    pool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'postgres',
      ssl: { rejectUnauthorized: false },
    });
  }
}

// ---------- Inicialización ----------
async function init() {
  if (USING_PG) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        token TEXT,
        created_at BIGINT
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        lugar TEXT,
        foto TEXT,
        user_id TEXT NOT NULL,
        created_at BIGINT,
        resolved BOOLEAN DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at BIGINT
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        lost_item_id TEXT NOT NULL,
        found_item_id TEXT NOT NULL,
        text TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at BIGINT
      );
    `);
    console.log('Conectado a Postgres (Supabase) — tablas listas.');
  } else {
    if (!fs.existsSync(JSON_PATH)) {
      fs.writeFileSync(JSON_PATH, JSON.stringify({ items: [], messages: [], users: [], notifications: [] }, null, 2));
    }
    console.log('Usando db.json local (no se configuró DATABASE_URL).');
  }
}

// ---------- Helpers para el modo JSON ----------
function readJson() {
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const db = JSON.parse(raw);
  if (!db.users) db.users = [];
  if (!db.notifications) db.notifications = [];
  return db;
}
function writeJson(db) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(db, null, 2));
}

// ==================== USUARIOS ====================

async function createUser(user) {
  if (USING_PG) {
    await pool.query(
      `INSERT INTO users (id, name, username, salt, password_hash, token, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user.id, user.name, user.username, user.salt, user.passwordHash, user.token, user.createdAt]
    );
  } else {
    const db = readJson();
    db.users.push(user);
    writeJson(db);
  }
}

async function getUserByUsername(username) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }
  const db = readJson();
  return db.users.find((u) => u.username === username) || null;
}

async function getUserByToken(token) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM users WHERE token = $1`, [token]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }
  const db = readJson();
  return db.users.find((u) => u.token === token) || null;
}

async function getUserById(id) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }
  const db = readJson();
  return db.users.find((u) => u.id === id) || null;
}

async function updateUserToken(userId, token) {
  if (USING_PG) {
    await pool.query(`UPDATE users SET token = $1 WHERE id = $2`, [token, userId]);
  } else {
    const db = readJson();
    const u = db.users.find((x) => x.id === userId);
    if (u) { u.token = token; writeJson(db); }
  }
}

function rowToUser(r) {
  return {
    id: r.id, name: r.name, username: r.username, salt: r.salt,
    passwordHash: r.password_hash, token: r.token, createdAt: Number(r.created_at),
  };
}

// ==================== OBJETOS (ITEMS) ====================

async function createItem(item) {
  if (USING_PG) {
    await pool.query(
      `INSERT INTO items (id, type, nombre, descripcion, lugar, foto, user_id, created_at, resolved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [item.id, item.type, item.nombre, item.descripcion, item.lugar, item.foto, item.userId, item.createdAt, item.resolved]
    );
  } else {
    const db = readJson();
    db.items.push(item);
    writeJson(db);
  }
}

async function getAllItems() {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM items`);
    return r.rows.map(rowToItem);
  }
  return readJson().items;
}

async function getItemById(id) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM items WHERE id = $1`, [id]);
    return r.rows[0] ? rowToItem(r.rows[0]) : null;
  }
  return readJson().items.find((i) => i.id === id) || null;
}

async function listItems({ type, excludeResolved }) {
  if (USING_PG) {
    let query = `SELECT * FROM items WHERE 1=1`;
    const params = [];
    if (excludeResolved) query += ` AND resolved = FALSE`;
    if (type) { params.push(type); query += ` AND type = $${params.length}`; }
    query += ` ORDER BY created_at DESC`;
    const r = await pool.query(query, params);
    return r.rows.map(rowToItem);
  }
  let items = readJson().items;
  if (excludeResolved) items = items.filter((i) => !i.resolved);
  if (type) items = items.filter((i) => i.type === type);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

async function resolveItem(id) {
  if (USING_PG) {
    await pool.query(`UPDATE items SET resolved = TRUE WHERE id = $1`, [id]);
  } else {
    const db = readJson();
    const item = db.items.find((i) => i.id === id);
    if (item) { item.resolved = true; writeJson(db); }
  }
}

function rowToItem(r) {
  return {
    id: r.id, type: r.type, nombre: r.nombre, descripcion: r.descripcion || '',
    lugar: r.lugar || '', foto: r.foto, userId: r.user_id,
    createdAt: Number(r.created_at), resolved: !!r.resolved,
  };
}

// ==================== MENSAJES ====================

async function addMessage(msg) {
  if (USING_PG) {
    await pool.query(
      `INSERT INTO messages (id, item_id, user_id, text, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [msg.id, msg.itemId, msg.userId, msg.text, msg.createdAt]
    );
  } else {
    const db = readJson();
    if (!db.messages) db.messages = [];
    db.messages.push(msg);
    writeJson(db);
  }
}

async function listMessages(itemId) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM messages WHERE item_id = $1 ORDER BY created_at ASC`, [itemId]);
    return r.rows.map((row) => ({
      id: row.id, itemId: row.item_id, userId: row.user_id, text: row.text, createdAt: Number(row.created_at),
    }));
  }
  const db = readJson();
  return (db.messages || []).filter((m) => m.itemId === itemId);
}

// ==================== NOTIFICACIONES ====================

async function notificationExists(userId, lostItemId, foundItemId) {
  if (USING_PG) {
    const r = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id=$1 AND lost_item_id=$2 AND found_item_id=$3`,
      [userId, lostItemId, foundItemId]
    );
    return r.rows.length > 0;
  }
  const db = readJson();
  return db.notifications.some((n) => n.userId === userId && n.lostItemId === lostItemId && n.foundItemId === foundItemId);
}

async function addNotification(n) {
  if (USING_PG) {
    await pool.query(
      `INSERT INTO notifications (id, user_id, lost_item_id, found_item_id, text, read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [n.id, n.userId, n.lostItemId, n.foundItemId, n.text, n.read, n.createdAt]
    );
  } else {
    const db = readJson();
    db.notifications.push(n);
    writeJson(db);
  }
}

async function listNotifications(userId) {
  if (USING_PG) {
    const r = await pool.query(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return r.rows.map((row) => ({
      id: row.id, userId: row.user_id, lostItemId: row.lost_item_id, foundItemId: row.found_item_id,
      text: row.text, read: !!row.read, createdAt: Number(row.created_at),
    }));
  }
  const db = readJson();
  return db.notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

async function markNotificationRead(id, userId) {
  if (USING_PG) {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`, [id, userId]);
  } else {
    const db = readJson();
    const n = db.notifications.find((x) => x.id === id && x.userId === userId);
    if (n) { n.read = true; writeJson(db); }
  }
}

module.exports = {
  init, USING_PG,
  createUser, getUserByUsername, getUserByToken, getUserById, updateUserToken,
  createItem, getAllItems, getItemById, listItems, resolveItem,
  addMessage, listMessages,
  notificationExists, addNotification, listNotifications, markNotificationRead,
};
