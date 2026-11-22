import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));

function loadConfiguredDatabase(environment) {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { config } from './src/config/env.js'; process.stdout.write(config.mongodbDatabase);"
  ], {
    cwd: apiRoot,
    env: { ...process.env, ...environment },
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

test('MongoDB database name defaults to experimental outside production and can be overridden', () => {
  assert.equal(loadConfiguredDatabase({
    NODE_ENV: 'development',
    MONGODB_DATABASE: ''
  }), 'harf_experimental');
  assert.equal(loadConfiguredDatabase({
    NODE_ENV: 'development',
    MONGODB_DATABASE: 'harf_local'
  }), 'harf_local');
});

test('production requires a separate explicit database name', () => {
  const environment = {
    ...process.env,
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    APP_ORIGIN: 'https://harf.example',
    CLIENT_ORIGINS: 'https://harf.example',
    SMTP_HOST: 'mail.example',
    SMTP_FROM: 'noreply@harf.example',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASSWORD: ''
  };
  environment.MONGODB_DATABASE = '';

  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import './src/config/env.js';"
  ], { cwd: apiRoot, env: environment, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MONGODB_DATABASE is required in production/);

  assert.throws(() => loadConfiguredDatabase({
    ...environment,
    MONGODB_DATABASE: 'harf_experimental'
  }), /Production must use a database other than harf_experimental/);
  assert.equal(loadConfiguredDatabase({
    ...environment,
    MONGODB_DATABASE: 'harf_production'
  }), 'harf_production');
});
