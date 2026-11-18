/**
 * Loaded before every test file (see the "test" script). Tests always run as
 * NODE_ENV=test — locally as in CI — so emails go to the in-memory outbox and
 * are never printed or sent to a real provider.
 */
process.env.NODE_ENV = 'test';
