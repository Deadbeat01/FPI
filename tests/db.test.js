// Pruebas de integración para GET/PUT /api/db — RF04 a RF09
// Mockean db/mysql para verificar que las rutas delegan correctamente al DAO.

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
const { getPool, buildDbJson, saveDbJson } = require('../db/mysql');

function makeMockConn() {
  return { query: jest.fn(), release: jest.fn() };
}

// ---- Lectura de datos: GET /api/db ----
describe('GET /api/db (RF04–RF09: lectura)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 y llama buildDbJson con el userId del header', async () => {
    const conn = makeMockConn();
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
    buildDbJson.mockResolvedValue({ courses: [], sections: {}, students: {} });

    const res = await request(app).get('/api/db').set('x-user-id', 'user_test_1');

    expect(res.statusCode).toBe(200);
    expect(buildDbJson).toHaveBeenCalledWith(conn, 'user_test_1');
    expect(conn.release).toHaveBeenCalled();
  });

  test('200 y llama buildDbJson con null cuando no hay header', async () => {
    const conn = makeMockConn();
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
    buildDbJson.mockResolvedValue({ courses: [] });

    const res = await request(app).get('/api/db');

    expect(res.statusCode).toBe(200);
    expect(buildDbJson).toHaveBeenCalledWith(conn, null);
  });

  test('500 cuando buildDbJson lanza un error', async () => {
    const conn = makeMockConn();
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
    buildDbJson.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/db');

    expect(res.statusCode).toBe(500);
  });
});

// ---- Escritura de datos: PUT /api/db ----
describe('PUT /api/db (RF04–RF09: escritura)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 sin header x-user-id', async () => {
    const res = await request(app).put('/api/db').send({ courses: [] });
    expect(res.statusCode).toBe(401);
    expect(saveDbJson).not.toHaveBeenCalled();
  });

  test('400 con cuerpo inválido (array en lugar de objeto)', async () => {
    const res = await request(app)
      .put('/api/db')
      .set('x-user-id', 'user_test_1')
      .send([1, 2, 3]);
    expect(res.statusCode).toBe(400);
    expect(saveDbJson).not.toHaveBeenCalled();
  });

  test('200 guarda correctamente y llama saveDbJson con los datos', async () => {
    const conn = makeMockConn();
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
    saveDbJson.mockResolvedValue(undefined);

    const body = { courses: [{ id: 'c1', nombre: 'Matemáticas' }] };
    const res = await request(app)
      .put('/api/db')
      .set('x-user-id', 'user_test_1')
      .send(body);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(saveDbJson).toHaveBeenCalledWith(conn, body, 'user_test_1');
    expect(conn.release).toHaveBeenCalled();
  });

  test('500 cuando saveDbJson lanza un error de transacción', async () => {
    const conn = makeMockConn();
    getPool.mockReturnValue({ getConnection: jest.fn().mockResolvedValue(conn) });
    saveDbJson.mockRejectedValue(new Error('Transaction rolled back'));

    const res = await request(app)
      .put('/api/db')
      .set('x-user-id', 'user_test_1')
      .send({ courses: [] });

    expect(res.statusCode).toBe(500);
  });
});
