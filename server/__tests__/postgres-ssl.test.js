const { postgresSslOptions, sequelizeDialectOptions } = require('../config/postgresSsl');

describe('postgresSslOptions', () => {
  test('is off for a local URL with no flags', () => {
    expect(postgresSslOptions('postgres://pdr:pdr@localhost:5432/roofing_crm', {})).toBeUndefined();
  });

  test('turns on from sslmode=require in the URL', () => {
    const ssl = postgresSslOptions('postgres://user:pass@host:25060/db?sslmode=require', {});
    expect(ssl).toEqual({ require: true, rejectUnauthorized: false });
  });

  test('DATABASE_SSL=false wins over sslmode in the URL', () => {
    expect(postgresSslOptions('postgres://host/db?sslmode=require', { DATABASE_SSL: 'false' })).toBeUndefined();
  });

  test('DATABASE_SSL=true enables SSL without sslmode', () => {
    const ssl = postgresSslOptions('postgres://host/db', { DATABASE_SSL: 'true' });
    expect(ssl.require).toBe(true);
  });

  test('sequelizeDialectOptions is empty when SSL is off', () => {
    expect(sequelizeDialectOptions('postgres://localhost/db', {})).toEqual({});
  });
});
