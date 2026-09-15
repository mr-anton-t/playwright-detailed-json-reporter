import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './specs',
  testMatch: 'reporter.fixture.ts',
  outputDir: process.env.TEST_OUTPUT,
  retries: 1,
  reporter: [[resolve('dist/index.js'), {
    outputFile: process.env.REPORT_OUTPUT,
    artifactsDir: process.env.REPORT_ARTIFACTS,
    quiet: true,
  }]],
});
