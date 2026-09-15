import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import type { DetailedJsonReport, ReportSuite, ReportTest } from './types.js';

function allTests(suites: ReportSuite[]): ReportTest[] {
  return suites.flatMap((suite) => [...suite.tests, ...allTests(suite.suites)]);
}

test('resolves from Playwright CommonJS configuration loading', () => {
  const reporterPath = createRequire(import.meta.url).resolve('playwright-detailed-json-reporter');
  assert.equal(reporterPath, resolve('dist/index.js'));
});

test('writes detailed Playwright data and copies artifacts', async () => {
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'detailed-json-reporter-'));
  const outputFile = resolve(temporaryDirectory, 'report.json');
  const artifactsDir = resolve(temporaryDirectory, 'artifacts');
  const configDirectory = resolve('test-fixtures');
  const cli = resolve('node_modules/@playwright/test/cli.js');

  try {
    const run = spawnSync(process.execPath, [cli, 'test', '--config', 'test-fixtures/playwright.config.ts'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        REPORT_OUTPUT: relative(configDirectory, outputFile),
        REPORT_ARTIFACTS: relative(configDirectory, artifactsDir),
        TEST_OUTPUT: resolve(temporaryDirectory, 'test-results'),
      },
    });
    assert.equal(run.status, 1, run.stderr || run.stdout);

    const report = JSON.parse(await readFile(outputFile, 'utf8')) as DetailedJsonReport;
    assert.equal(report.schemaName, 'playwright-detailed-json');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.run.status, 'failed');

    const [reportedTest] = allTests(report.suites);
    assert.ok(reportedTest);
    assert.deepEqual(reportedTest.tags, ['@smoke', '@reporter']);
    assert.equal(reportedTest.results.length, 2);
    assert.match(reportedTest.source?.snippet ?? '', /captures a detailed failure/);

    const [attempt] = reportedTest.results;
    assert.ok(attempt);
    assert.match(attempt.stdout.map((chunk) => chunk.value).join(''), /stdout from reporter fixture/);
    assert.match(attempt.stderr.map((chunk) => chunk.value).join(''), /stderr from reporter fixture/);
    assert.match(attempt.errors[0]?.source?.snippet ?? '', /expect\(1\)\.toBe\(2\)/);

    const outerStep = attempt.steps.find((step) => step.title === 'outer user step');
    const visualStep = outerStep?.steps.find((step) => step.title === 'visual assertion artifacts');
    assert.ok(visualStep);
    assert.match(visualStep.source?.snippet ?? '', /visual assertion artifacts/);

    const attachments = attempt.attachments;
    assert.deepEqual(
      attachments.filter((attachment) => attachment.kind === 'screenshot').map((attachment) => attachment.screenshotRole).sort(),
      ['actual', 'diff', 'expected'],
    );
    for (const screenshot of attachments.filter((attachment) => attachment.screenshotRole)) {
      assert.equal(screenshot.snapshotName, 'dashboard.png');
      assert.equal(basename(screenshot.path ?? ''), 'dashboard.png');
    }
    assert.equal(attachments.find((attachment) => attachment.kind === 'trace')?.name, 'trace');
    for (const attachment of attachments) {
      assert.ok(attachment.path);
      assert.equal(existsSync(resolve(dirname(outputFile), attachment.path)), true);
    }

    assert.match(readFileSync(outputFile, 'utf8'), /"steps": \[/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
