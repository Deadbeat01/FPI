// Pruebas unitarias puras de utils/mailer.js — RF03, RF12
// No requieren HTTP ni base de datos; mockean solo DNS.

jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

const dnsPromises = require('dns').promises;
const { emailDomainExists } = require('../utils/mailer');

describe('emailDomainExists', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna true cuando el dominio tiene registros MX válidos', async () => {
    dnsPromises.resolveMx.mockResolvedValue([{ exchange: 'mail.gmail.com', priority: 5 }]);
    expect(await emailDomainExists('test@gmail.com')).toBe(true);
  });

  test('retorna false cuando el DNS lanza error (dominio inexistente)', async () => {
    dnsPromises.resolveMx.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await emailDomainExists('test@dominio-inexistente-xyz123.com')).toBe(false);
  });

  test('retorna false cuando la entrada es null', async () => {
    expect(await emailDomainExists(null)).toBe(false);
    expect(dnsPromises.resolveMx).not.toHaveBeenCalled();
  });

  test('retorna false cuando no hay símbolo @ en el email', async () => {
    expect(await emailDomainExists('solousuario')).toBe(false);
    expect(dnsPromises.resolveMx).not.toHaveBeenCalled();
  });

  test('retorna false para cadena vacía', async () => {
    expect(await emailDomainExists('')).toBe(false);
    expect(dnsPromises.resolveMx).not.toHaveBeenCalled();
  });
});
