import { expect, test } from '@playwright/test';

test('captures a detailed failure', { tag: ['@smoke', '@reporter'] }, async ({}, testInfo) => {
  console.log('stdout from reporter fixture');
  console.error('stderr from reporter fixture');

  await test.step('outer user step', async () => {
    await test.step('visual assertion artifacts', async () => {
      await testInfo.attach('dashboard-expected.png', { body: Buffer.from('expected'), contentType: 'image/png' });
      await testInfo.attach('dashboard-actual.png', { body: Buffer.from('actual'), contentType: 'image/png' });
      await testInfo.attach('dashboard-diff.png', { body: Buffer.from('diff'), contentType: 'image/png' });
      await testInfo.attach('trace', { body: Buffer.from('trace'), contentType: 'application/zip' });
      expect(1).toBe(2);
    });
  });
});
