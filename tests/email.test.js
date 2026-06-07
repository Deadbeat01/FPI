// Pruebas de integración para endpoints de email — RF03, RF12
// Mockean db/mysql y utils/mailer para no requerir red ni SMTP.

jest.mock('../db/mysql', () => ({
  getPool: jest.fn(() => ({ getConnection: jest.fn() })),
  buildDbJson: jest.fn(),
  saveDbJson: jest.fn(),
  DB_CONFIG: { host: 'localhost', database: 'test', user: 'test' },
}));

jest.mock('../utils/mailer', () => ({
  emailDomainExists: jest.fn(),
  sendContactEmail:  jest.fn().mockResolvedValue({}),
  sendRecoveryEmail: jest.fn().mockResolvedValue({}),
}));

const request = require('supertest');
const { app } = require('../server');
const { emailDomainExists, sendContactEmail, sendRecoveryEmail } = require('../utils/mailer');

// ---- RF12: Formulario de contacto ----
describe('POST /api/contact (RF12)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 y envía email cuando los datos y el dominio son válidos', async () => {
    emailDomainExists.mockResolvedValue(true);
    const res = await request(app).post('/api/contact').send({
      fromName:  'Juan Pérez',
      fromEmail: 'juan@gmail.com',
      subject:   'Consulta sobre el sistema',
      message:   'Hola, tengo una pregunta.',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  test('400 cuando el dominio del correo no tiene registros MX', async () => {
    emailDomainExists.mockResolvedValue(false);
    const res = await request(app).post('/api/contact').send({
      fromName:  'Juan',
      fromEmail: 'juan@dominio-fake-xyz.com',
      subject:   'Test',
      message:   'Mensaje de prueba',
    });
    expect(res.statusCode).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  test('400 cuando faltan campos obligatorios', async () => {
    const res = await request(app).post('/api/contact').send({ fromName: 'Juan' });
    expect(res.statusCode).toBe(400);
    expect(emailDomainExists).not.toHaveBeenCalled();
  });
});

// ---- RF03: Envío de código de recuperación ----
describe('POST /api/send-code (RF03)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 y envía código cuando el dominio es válido', async () => {
    emailDomainExists.mockResolvedValue(true);
    const res = await request(app).post('/api/send-code').send({
      toEmail: 'docente@gmail.com',
      code:    '123456',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sendRecoveryEmail).toHaveBeenCalledWith({ toEmail: 'docente@gmail.com', code: '123456' });
  });

  test('400 cuando el dominio del correo es inválido', async () => {
    emailDomainExists.mockResolvedValue(false);
    const res = await request(app).post('/api/send-code').send({
      toEmail: 'docente@dominio-invalido.xyz',
      code:    '999999',
    });
    expect(res.statusCode).toBe(400);
    expect(sendRecoveryEmail).not.toHaveBeenCalled();
  });

  test('400 cuando falta el código en el cuerpo', async () => {
    const res = await request(app).post('/api/send-code').send({ toEmail: 'docente@gmail.com' });
    expect(res.statusCode).toBe(400);
    expect(emailDomainExists).not.toHaveBeenCalled();
  });
});
