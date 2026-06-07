// Pruebas de integración para endpoints de autenticación — RF01, RF02, RF03, RF11
// Mockean db/mysql para no requerir conexión real a MySQL.
// Las contraseñas en los mocks son texto plano para evitar bcrypt.hash en los datos de prueba.
// (El servidor usa comparación === cuando la contraseña no empieza con '$2b$'.)

jest.mock('../db/mysql', () => ({
  getPool:     jest.fn(),
  buildDbJson: jest.fn(),
  saveDbJson:  jest.fn(),
  DB_CONFIG:   { host: 'localhost', database: 'test', user: 'test' },
}));

jest.mock('../utils/mailer', () => ({
  emailDomainExists: jest.fn(),
  sendContactEmail:  jest.fn(),
  sendRecoveryEmail: jest.fn(),
}));

const request = require('supertest');
const { app } = require('../server');
const { getPool } = require('../db/mysql');

// Usuario docente base con contraseña en texto plano
const BASE_USER = {
  id:               'user_test_1',
  usuario:          'docente_test',
  contrasena:       'password123',
  rol:              'docente',
  activo:           1,
  intentos_fallidos: 0,
  bloqueado_hasta:  null,
  nombre_display:   'Docente Prueba',
  correo:           'docente@test.com',
};

function makeMockConn(queryImpl) {
  return {
    query:   jest.fn().mockImplementation(queryImpl || (() => Promise.resolve([[]]))),
    release: jest.fn(),
  };
}

function setupPool(conn) {
  getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
}

// ---- RF01: Login ----
describe('POST /api/auth/login (RF01)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 con credenciales correctas', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT * FROM usuarios')) return [[BASE_USER]];
      return [{ affectedRows: 1 }];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'password123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('user_test_1');
    expect(res.body.rol).toBe('docente');
  });

  test('401 con contraseña incorrecta', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT * FROM usuarios')) return [[BASE_USER]];
      return [{ affectedRows: 1 }];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'contrasena_incorrecta',
    });

    expect(res.statusCode).toBe(401);
  });

  test('401 cuando el usuario no existe en la BD', async () => {
    const conn = makeMockConn(async () => [[]]);
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'usuario_inexistente', password: 'cualquiera',
    });

    expect(res.statusCode).toBe(401);
  });

  test('403 cuando la cuenta está bloqueada (bloqueado_hasta en el futuro)', async () => {
    const bloqueado = { ...BASE_USER, bloqueado_hasta: Date.now() + 900000 };
    const conn = makeMockConn(async () => [[bloqueado]]);
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'password123',
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/bloqueada/i);
  });

  test('403 cuando la cuenta está desactivada (activo = 0)', async () => {
    const inactivo = { ...BASE_USER, activo: 0, bloqueado_hasta: null };
    const conn = makeMockConn(async () => [[inactivo]]);
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'password123',
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/desactivada/i);
  });

  test('400 cuando faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'solo_usuario' });
    expect(res.statusCode).toBe(400);
  });

  test('bloquea la cuenta en el 5to intento fallido', async () => {
    const casi_bloqueado = { ...BASE_USER, intentos_fallidos: 4 };
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT * FROM usuarios')) return [[casi_bloqueado]];
      return [{ affectedRows: 1 }];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'contrasena_incorrecta',
    });

    expect(res.statusCode).toBe(401);
    // Verifica que se llamó UPDATE con bloqueado_hasta para bloquear la cuenta
    const llamadas = conn.query.mock.calls;
    const llamadaBloqueo = llamadas.find(c => c[0].includes('bloqueado_hasta'));
    expect(llamadaBloqueo).toBeDefined();
  });

  test('resetea intentos_fallidos a 0 tras login exitoso', async () => {
    const con_intentos = { ...BASE_USER, intentos_fallidos: 3 };
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT * FROM usuarios')) return [[con_intentos]];
      return [{ affectedRows: 1 }];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/login').send({
      username: 'docente_test', password: 'password123',
    });

    expect(res.statusCode).toBe(200);
    const llamadas = conn.query.mock.calls;
    const llamadaReset = llamadas.find(c => c[0].includes('intentos_fallidos = 0'));
    expect(llamadaReset).toBeDefined();
  });
});

// ---- RF02: Registro de docente ----
describe('POST /api/auth/register (RF02)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 registra un nuevo docente correctamente', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT id FROM usuarios WHERE usuario'))  return [[]];
      if (sql.includes('SELECT id FROM usuarios WHERE correo'))   return [[]];
      if (sql.includes('INSERT INTO usuarios'))                   return [{ affectedRows: 1 }];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/register').send({
      username: 'nuevo_docente', email: 'nuevo@test.com', password: 'securepass123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.rol).toBe('docente');
    expect(res.body.username).toBe('nuevo_docente');
  });

  test('400 cuando el nombre de usuario ya está en uso', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT id FROM usuarios WHERE usuario')) return [[{ id: 'user_existente' }]];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/register').send({
      username: 'docente_existente', email: 'nuevo@test.com', password: 'pass',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/usuario/i);
  });

  test('400 cuando el correo ya está registrado', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT id FROM usuarios WHERE usuario')) return [[]];
      if (sql.includes('SELECT id FROM usuarios WHERE correo'))  return [[{ id: 'user_existente' }]];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/register').send({
      username: 'docente_nuevo', email: 'correo_existente@test.com', password: 'pass',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/correo/i);
  });

  test('400 cuando faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'test' });
    expect(res.statusCode).toBe(400);
  });
});

// ---- RF11: Cambio de contraseña ----
describe('POST /api/auth/change-password (RF11)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 cambia la contraseña cuando la actual es correcta', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT contrasena FROM usuarios')) return [[{ contrasena: 'vieja_pass' }]];
      if (sql.includes('UPDATE usuarios SET contrasena'))  return [{ affectedRows: 1 }];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/change-password').send({
      userId: 'user_test_1', currentPassword: 'vieja_pass', newPassword: 'nueva_pass_123',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('401 cuando la contraseña actual es incorrecta', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT contrasena FROM usuarios')) return [[{ contrasena: 'vieja_pass' }]];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/change-password').send({
      userId: 'user_test_1', currentPassword: 'pass_incorrecta', newPassword: 'nueva_pass_123',
    });

    expect(res.statusCode).toBe(401);
  });

  test('400 cuando faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/auth/change-password').send({ userId: 'user_1' });
    expect(res.statusCode).toBe(400);
  });
});

// ---- RF03: Reseteo de contraseña (desde link de recuperación) ----
describe('POST /api/auth/reset-password (RF03)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 resetea la contraseña correctamente', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('UPDATE usuarios SET contrasena')) return [{ affectedRows: 1 }];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/reset-password').send({
      userId: 'user_test_1', newPassword: 'contrasena_nueva_segura',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('404 cuando el userId no existe en la BD', async () => {
    const conn = makeMockConn(async (sql) => {
      if (sql.includes('UPDATE usuarios SET contrasena')) return [{ affectedRows: 0 }];
      return [[]];
    });
    setupPool(conn);

    const res = await request(app).post('/api/auth/reset-password').send({
      userId: 'user_inexistente', newPassword: 'contrasena_nueva',
    });

    expect(res.statusCode).toBe(404);
  });

  test('400 cuando faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ userId: 'user_1' });
    expect(res.statusCode).toBe(400);
  });
});
