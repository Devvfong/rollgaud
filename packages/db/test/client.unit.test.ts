import assert from 'node:assert/strict';
import test from 'node:test';

import { db } from '../src/index.js';

test('DB package exports a Prisma client without opening a connection', async (t) => {
  t.after(async () => {
    await db.$disconnect();
  });

  assert.equal(typeof db.$transaction, 'function');
});
