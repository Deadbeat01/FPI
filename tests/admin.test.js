// Pruebas de integración para panel de administración — RF10
// requireAdmin hace su propia getConnection(); el handler hace otra.
// setupAdminPool separa las dos conexiones con mockResolvedValueOnce.

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

const ADMIN_ID = 'admin_default';

function makeMockConn(queryImpl) {
  return {
    query:   jest.fn().mockImplementation(queryImpl || (() => Promise.resolve([[]]))),
    release: jest.fn(),
  };
}

// Primera conexión → requireAdmin; segunda → route handler
function setupAdminPool(adminConn, handlerConn) {
  getPool.mockReturnValue({
    getConnection: jest.fn()
      .mockResolvedValueOnce(adminConn)
      .mockResolvedValueOnce(handlerConn),
  });
}

// ---- Control de acceso ----
describe('Control de acceso (RF10)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 sin header x-user-id', async () => {
    // requireAdmin retorna 401 antes de llamar a getPool()
    const res = await request(app).get('/api/admin/stats');
    expect(res.statusCode).toBe(401);
  });

  test('403 cuando el userId corresponde a un docente (no admin)', async () => {
    const conn = makeMockConn(async () => [[{ rol: 'docente' }]]);
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });

    const res = await request(app)
      .get('/api/admin/stats')
      .set('x-user-id', 'user_docente_123');

    expect(res.statusCode).toBe(403);
  });
});

// ---- GET /api/admin/stats ----
describe('GET /api/admin/stats (RF10 — estadísticas globales)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 retorna estadísticas globales y datos por docente', async () => {
    const globalStats = { total_cuentas: 3, total_cursos: 10, total_secciones: 15, total_alumnos: 45 };
    const perUser     = [{ id: 'u1', usuario: 'prof1', nombre_display: 'Prof 1', correo: 'p@t.com', activo: 1, creado_en: 0, total_cursos: 2, total_secciones: 3, total_alumnos: 10 }];

    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async (sql) => {
      if (sql.includes('total_cuentas'))   return [[globalStats]];
      if (sql.includes('LEFT JOIN cursos')) return [perUser];
      return [[]];
    });
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .get('/api/admin/stats')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(200);
    expect(res.body.global.total_cuentas).toBe(3);
    expect(res.body.perUser).toHaveLength(1);
  });
});

// ---- GET /api/admin/accounts ----
describe('GET /api/admin/accounts (RF10 — lista de docentes)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 retorna lista de cuentas docentes mapeadas', async () => {
    const accounts    = [{ id: 'u1', usuario: 'prof1', nombre_display: 'Prof 1', correo: 'p@t.com', activo: 1, creado_en: 0 }];
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [accounts]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .get('/api/admin/accounts')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe('prof1');
    expect(res.body[0].activo).toBe(true);
  });
});

// ---- PUT /api/admin/accounts/:id/status ----
describe('PUT /api/admin/accounts/:id/status (RF10 — activar/desactivar)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 activa una cuenta de docente correctamente', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT rol FROM usuarios WHERE id')) return [[{ rol: 'docente' }]];
      if (sql.includes('UPDATE usuarios SET activo'))        return [{ affectedRows: 1 }];
      return [[]];
    });
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .put('/api/admin/accounts/u1/status')
      .set('x-user-id', ADMIN_ID)
      .send({ activo: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('400 al intentar modificar la cuenta del administrador', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [[{ rol: 'admin' }]]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .put('/api/admin/accounts/admin_default/status')
      .set('x-user-id', ADMIN_ID)
      .send({ activo: false });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/admin/i);
  });

  test('404 cuando el usuario a modificar no existe', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [[]]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .put('/api/admin/accounts/usuario_inexistente/status')
      .set('x-user-id', ADMIN_ID)
      .send({ activo: true });

    expect(res.statusCode).toBe(404);
  });
});

// ---- DELETE /api/admin/accounts/:id ----
describe('DELETE /api/admin/accounts/:id (RF10 — eliminar docente)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 elimina una cuenta de docente', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async (sql) => {
      if (sql.includes('SELECT rol FROM usuarios WHERE id')) return [[{ rol: 'docente' }]];
      if (sql.includes('DELETE FROM usuarios'))             return [{ affectedRows: 1 }];
      return [[]];
    });
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .delete('/api/admin/accounts/u1')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('400 al intentar eliminar la cuenta del administrador', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [[{ rol: 'admin' }]]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .delete('/api/admin/accounts/admin_default')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(400);
  });
});

// ---- GET /api/admin/blocked + PUT /api/admin/accounts/:id/unblock ----
describe('Gestión de cuentas bloqueadas (RF10)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 retorna lista de cuentas bloqueadas', async () => {
    const bloqueadas  = [{ id: 'u1', usuario: 'prof1', nombre_display: 'Prof 1', correo: 'p@t.com', intentos_fallidos: 5, bloqueado_hasta: Date.now() + 60000 }];
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [bloqueadas]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .get('/api/admin/blocked')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].intentos).toBe(5);
  });

  test('200 desbloquea una cuenta (resetea intentos y bloqueado_hasta)', async () => {
    const adminConn   = makeMockConn(async () => [[{ rol: 'admin' }]]);
    const handlerConn = makeMockConn(async () => [{ affectedRows: 1 }]);
    setupAdminPool(adminConn, handlerConn);

    const res = await request(app)
      .put('/api/admin/accounts/u1/unblock')
      .set('x-user-id', ADMIN_ID);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
