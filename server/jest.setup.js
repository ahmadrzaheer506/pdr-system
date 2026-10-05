process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://pdr:pdr@localhost:5432/pdr_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-not-for-production-use';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
