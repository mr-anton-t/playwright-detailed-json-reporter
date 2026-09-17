# Playwright Detailed JSON Reporter

An independent reporter that writes detailed JSON and copies Playwright artifacts alongside it.

## Report contents

- Projects, suites, tests, retries, and results.
- The complete recursive step tree, including hooks, fixtures, and Playwright API actions.
- Source locations and code snippets for tests and steps.
- Errors, stack traces, and Playwright code frames.
- Tags and annotations.
- Stdout and stderr without binary data loss.
- Traces, videos, and other attachments.
- `expected`, `actual`, and `diff` images produced by `expect(page).toHaveScreenshot()`.

Artifacts are copied to `artifacts/`, and the JSON contains paths relative to the report file.

Screenshot comparison artifacts are grouped into `screenshots/expected`, `screenshots/actual`, and `screenshots/diff`. Each file uses the original baseline name. For example, Playwright's `dashboard-actual.png` attachment is stored as `screenshots/actual/dashboard.png`, so it can be downloaded and copied directly over the baseline without renaming.

## Build

```bash
npm install
npm run build
```

## Configuration

Install the reporter from GitHub:

```bash
npm install --save-dev github:mr-anton-t/playwright-detailed-json-reporter
```

Add it to `playwright.config.ts` by its package name:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  metadata: {
    productVersion: '26.3.0',
    edition: 'EE',
    type: 'clean', // regular, clean, local, or an empty string
  },
  reporter: [
    ['html', { outputFolder: 'build/report', open: 'never' }],
    [
      'playwright-detailed-json-reporter',
      {
        outputFile: 'build/detailed-json/report.json',
        artifactsDir: 'build/detailed-json/artifacts',
        includeSource: true,
        sourceContextLines: 3,
      },
    ],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

Relative output paths are resolved from the directory containing `playwright.config.ts`. When Playwright runs without a configuration file, the reporter falls back to `rootDir`. If tests run in Docker, install the dependency inside the image with `npm ci`; host `node_modules` are not available in the container.

No additional hooks are required for `toHaveScreenshot()`. When a comparison fails, Playwright creates attachments for the expected, actual, and diff images.

## Access metadata in tests

```ts
import { test } from '@playwright/test';
import type { ReportMetadata } from 'playwright-detailed-json-reporter';

test('uses the product version', async ({ page }, testInfo) => {
  const metadata = testInfo.config.metadata as ReportMetadata;
  const productVersion = metadata.productVersion;

  await page.goto(`/about?version=${productVersion}`);
});
```

## Format

Top-level fields:

```json
{
  "schemaName": "playwright-detailed-json",
  "schemaVersion": 1,
  "generatedAt": "2026-09-17T00:03:39.081Z",
  "config": {
    "metadata": {
      "productVersion": "26.3.0",
      "edition": "EE",
      "type": "clean"
    }
  },
  "run": {},
  "projects": [],
  "suites": [],
  "errors": []
}
```

The report is a single JSON object, not an array. All top-level fields shown above are always present. The format is versioned and uses only the public Playwright Reporter API.
