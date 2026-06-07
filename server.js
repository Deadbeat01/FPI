require('dotenv').config();

const IS_TEST = process.env.NODE_ENV === 'test';

const express   = require('express');
const path      = require('path');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcrypt');
const { getPool, buildDbJson, saveDbJson, DB_CONFIG } = require('./db/mysql');
const { emailDomainExists, sendContactEmail, sendRecoveryEmail } = require('./utils/mailer');

const SALT_ROUNDS  = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MS   = 15 * 60 * 1000; // 15 minutos

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'"],
      imgSrc:        ["'self'", "data:", "blob:"],
    },
  },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '50mb' }));

// Bloquear acceso HTTP a archivos del servidor (código fuente, configs, BD)
const RUTAS_BLOQUEADAS = ['/node_modules', '/db/', '/utils/', '/data/'];
const ARCHIVOS_BLOQUEADOS = new Set([
  '/server.js', '/migrate.js', '/schema.sql',
  '/package.json', '/package-lock.json',
  '/.env', '/.env.example',
]);
app.use((req, res, next) => {
  const p = req.path;
  if (ARCHIVOS_BLOQUEADOS.has(p) || RUTAS_BLOQUEADAS.some(r => p.startsWith(r)))
    return res.status(404).end();
  next();
});
app.use(express.static(__dirname));

// Rate limiting (desactivado en entorno de tests para no interferir con la suite)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: IS_TEST ? 9999 : 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
});
app.use('/api/auth', authLimiter);

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: IS_TEST ? 9999 : 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});
app.use('/api/contact',   emailLimiter);
app.use('/api/send-code', emailLimiter);

// Rate limiting para endpoints de base de datos
const dbLimiter = rateLimit({
  windowMs: 60 * 1000, max: IS_TEST ? 9999 : 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera un momento.' },
});
app.use('/api/db', dbLimiter);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// ---- DB GENÉRICO ----
app.get('/api/db', async (req, res) => {
  const userId = req.headers['x-user-id'] || null;
  try {
    const conn = await getPool().getConnection();
    try { res.json(await buildDbJson(conn, userId)); }
    finally { conn.release(); }
  } catch (err) {
    console.error('Error leyendo MySQL:', err.message);
    res.status(500).json({ error: 'Error al leer la base de datos' });
  }
});

app.put('/api/db', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'No autorizado' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return res.status(400).json({ error: 'Cuerpo de solicitud inválido' });
  try {
    const conn = await getPool().getConnection();
    try { await saveDbJson(conn, body, userId); res.json({ ok: true }); }
    finally { conn.release(); }
  } catch (err) {
    console.error('Error guardando en MySQL:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la base de datos' });
  }
});

// ---- MIDDLEWARE ADMIN ----
async function requireAdmin(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'No autorizado' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT rol FROM usuarios WHERE id = ?', [userId]);
      if (!rows.length || rows[0].rol !== 'admin')
        return res.status(403).json({ error: 'Acceso denegado' });
      next();
    } finally { conn.release(); }
  } catch {
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ---- ADMIN: ESTADÍSTICAS GENERALES ----
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const conn = await getPool().getConnection();
    try {
      const [[global]] = await conn.query(`
        SELECT
          (SELECT COUNT(*) FROM usuarios WHERE rol = 'docente') AS total_cuentas,
          (SELECT COUNT(*) FROM cursos)                         AS total_cursos,
          (SELECT COUNT(*) FROM secciones)                      AS total_secciones,
          (SELECT COUNT(*) FROM alumnos WHERE retirado = 0)     AS total_alumnos
      `);
      const [perUser] = await conn.query(`
        SELECT
          u.id, u.usuario, u.nombre_display, u.correo, u.activo, u.creado_en,
          COUNT(DISTINCT c.id)  AS total_cursos,
          COUNT(DISTINCT s.id)  AS total_secciones,
          COUNT(DISTINCT al.id) AS total_alumnos
        FROM usuarios u
        LEFT JOIN cursos    c  ON c.id_usuario = u.id
        LEFT JOIN secciones s  ON s.id_curso   = c.id
        LEFT JOIN alumnos   al ON al.id_salon   = s.id_salon AND al.retirado = 0
        WHERE u.rol = 'docente'
        GROUP BY u.id, u.usuario, u.nombre_display, u.correo, u.activo, u.creado_en
        ORDER BY u.creado_en ASC
      `);
      res.json({ global, perUser });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- ADMIN: LISTA DE CUENTAS ----
app.get('/api/admin/accounts', requireAdmin, async (req, res) => {
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query(`
        SELECT id, usuario, nombre_display, correo, activo, creado_en
        FROM usuarios WHERE rol = 'docente'
        ORDER BY creado_en ASC
      `);
      res.json(rows.map(u => ({
        id: u.id, username: u.usuario,
        displayName: u.nombre_display || u.usuario,
        email: u.correo, activo: !!u.activo, createdAt: u.creado_en,
      })));
    } finally { conn.release(); }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- ADMIN: CAMBIAR ESTADO CUENTA ----
app.put('/api/admin/accounts/:id/status', requireAdmin, async (req, res) => {
  const { activo } = req.body || {};
  if (activo === undefined) return res.status(400).json({ error: 'Campo activo requerido' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT rol FROM usuarios WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (rows[0].rol === 'admin') return res.status(400).json({ error: 'No se puede modificar la cuenta admin' });
      await conn.query('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- ADMIN: ELIMINAR CUENTA ----
app.delete('/api/admin/accounts/:id', requireAdmin, async (req, res) => {
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT rol FROM usuarios WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (rows[0].rol === 'admin') return res.status(400).json({ error: 'No se puede eliminar la cuenta admin' });
      await conn.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- ADMIN: CUENTAS BLOQUEADAS ----
app.get('/api/admin/blocked', requireAdmin, async (req, res) => {
  try {
    const conn = await getPool().getConnection();
    try {
      const now = Date.now();
      const [rows] = await conn.query(`
        SELECT id, usuario, nombre_display, correo, intentos_fallidos, bloqueado_hasta
        FROM usuarios
        WHERE rol = 'docente' AND (bloqueado_hasta > ? OR intentos_fallidos >= ?)
        ORDER BY bloqueado_hasta DESC
      `, [now, MAX_INTENTOS]);
      res.json(rows.map(u => ({
        id: u.id, username: u.usuario,
        displayName: u.nombre_display || u.usuario,
        email: u.correo,
        intentos: u.intentos_fallidos,
        bloqueadoHasta: u.bloqueado_hasta,
      })));
    } finally { conn.release(); }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- ADMIN: DESBLOQUEAR CUENTA ----
app.put('/api/admin/accounts/:id/unblock', requireAdmin, async (req, res) => {
  try {
    const conn = await getPool().getConnection();
    try {
      await conn.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
        [req.params.id]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- AUTH: LOGIN ----
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT * FROM usuarios WHERE usuario = ?', [username]);
      if (!rows.length) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      const u = rows[0];

      // Verificaciones de estado (solo para docentes)
      if (u.rol !== 'admin') {
        if (!u.activo) {
          return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
        }
        const now = Date.now();
        if (u.bloqueado_hasta && u.bloqueado_hasta > now) {
          const mins = Math.ceil((u.bloqueado_hasta - now) / 60000);
          return res.status(403).json({ error: `Cuenta bloqueada por intentos fallidos. Intenta en ${mins} min.` });
        }
      }

      // Verificar contraseña
      let match;
      if (u.contrasena && u.contrasena.startsWith('$2b$')) {
        match = await bcrypt.compare(password, u.contrasena);
      } else {
        match = u.contrasena === password;
        if (match) {
          const hashed = await bcrypt.hash(password, SALT_ROUNDS);
          await conn.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hashed, u.id]);
        }
      }

      if (!match) {
        if (u.rol !== 'admin') {
          const nuevos = (u.intentos_fallidos || 0) + 1;
          if (nuevos >= MAX_INTENTOS) {
            const bloqueadoHasta = Date.now() + BLOQUEO_MS;
            await conn.query(
              'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?',
              [nuevos, bloqueadoHasta, u.id]
            );
            return res.status(401).json({ error: `Demasiados intentos. Cuenta bloqueada por 15 minutos.` });
          }
          await conn.query('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [nuevos, u.id]);
        }
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }

      // Login exitoso: resetear intentos
      if (u.rol !== 'admin') {
        await conn.query(
          'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
          [u.id]
        );
      }

      res.json({
        id: u.id, username: u.usuario,
        displayName: u.nombre_display || u.usuario,
        email: u.correo, rol: u.rol,
      });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- AUTH: REGISTER ----
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [byUser]  = await conn.query('SELECT id FROM usuarios WHERE usuario = ?', [username]);
      if (byUser.length) return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });
      const [byEmail] = await conn.query('SELECT id FROM usuarios WHERE correo  = ?', [email]);
      if (byEmail.length) return res.status(400).json({ error: 'Ese correo ya está registrado' });

      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      const id     = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await conn.query(
        'INSERT INTO usuarios (id, usuario, nombre_display, correo, contrasena, rol, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, username, username, email, hashed, 'docente', 1, Date.now()]
      );
      res.json({ id, username, displayName: username, email, rol: 'docente' });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- AUTH: CAMBIAR CONTRASEÑA ----
app.post('/api/auth/change-password', async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body || {};
  if (!userId || !currentPassword || !newPassword) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT contrasena FROM usuarios WHERE id = ?', [userId]);
      if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      const stored = rows[0].contrasena;
      const match = stored.startsWith('$2b$')
        ? await bcrypt.compare(currentPassword, stored)
        : stored === currentPassword;
      if (!match) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await conn.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hashed, userId]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Change-password error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- AUTH: ELIMINAR CUENTA PROPIA ----
app.delete('/api/auth/account', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'No autorizado' });
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Se requiere la contraseña para confirmar' });
  try {
    const conn = await getPool().getConnection();
    try {
      const [rows] = await conn.query('SELECT contrasena, rol FROM usuarios WHERE id = ?', [userId]);
      if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
      if (rows[0].rol === 'admin') return res.status(400).json({ error: 'No se puede eliminar la cuenta de administrador' });
      const stored = rows[0].contrasena;
      const match = stored.startsWith('$2b$')
        ? await bcrypt.compare(password, stored)
        : stored === password;
      if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });
      // Borrar cursos primero (cursos.id_usuario es ON DELETE SET NULL, no CASCADE)
      // Esto cascadea: competencias_curso, secciones → horario_secciones → actividades → notas
      await conn.query('DELETE FROM cursos WHERE id_usuario = ?', [userId]);
      await conn.query('DELETE FROM usuarios WHERE id = ?', [userId]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- AUTH: RESETEAR CONTRASEÑA ----
app.post('/api/auth/reset-password', async (req, res) => {
  const { userId, newPassword } = req.body || {};
  if (!userId || !newPassword) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const conn = await getPool().getConnection();
    try {
      const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const [result] = await conn.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hashed, userId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    console.error('Reset-password error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ---- EMAIL: FORMULARIO DE CONTACTO ----
app.post('/api/contact', async (req, res) => {
  const { fromName, fromEmail, subject, message } = req.body || {};
  if (!fromName || !fromEmail || !subject || !message)
    return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const valid = await emailDomainExists(fromEmail);
    if (!valid) return res.status(400).json({ error: 'El dominio del correo no existe o no acepta emails' });
    await sendContactEmail({ fromName, fromEmail, subject, message });
    res.json({ ok: true });
  } catch (err) {
    console.error('Contact email error:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje. Intenta más tarde.' });
  }
});

// ---- EMAIL: CÓDIGO DE RECUPERACIÓN ----
app.post('/api/send-code', async (req, res) => {
  const { toEmail, code } = req.body || {};
  if (!toEmail || !code) return res.status(400).json({ error: 'Campos incompletos' });
  try {
    const valid = await emailDomainExists(toEmail);
    if (!valid) return res.status(400).json({ error: 'El dominio del correo no existe o no acepta emails' });
    await sendRecoveryEmail({ toEmail, code });
    res.json({ ok: true });
  } catch (err) {
    console.error('Recovery email error:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el código. Intenta más tarde.' });
  }
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  (async () => {
    try {
      const conn = await getPool().getConnection();
      await conn.ping();
      conn.release();
      console.log(`Conectado a MySQL: ${DB_CONFIG.host}/${DB_CONFIG.database}`);
      app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
    } catch (err) {
      console.error('\n ERROR al conectar con MySQL:', err.message);
      console.error(` Host: ${DB_CONFIG.host}  DB: ${DB_CONFIG.database}  User: ${DB_CONFIG.user}\n`);
      process.exit(1);
    }
  })();
}

module.exports = { app };
