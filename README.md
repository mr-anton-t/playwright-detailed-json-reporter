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

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['html', { outputFolder: 'build/report', open: 'never' }],
    [
      './reporter-pw/playwright-detailed-json-reporter/dist/index.js',
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

No additional hooks are required for `toHaveScreenshot()`. When a comparison fails, Playwright creates attachments for the expected, actual, and diff images.

## Format

Top-level fields:

```json
{
  "schemaName": "playwright-detailed-json",
  "schemaVersion": 1,
  "generatedAt": "2026-09-14T00:00:00.000Z",
  "run": {},
  "config": {},
  "projects": [],
  "suites": [],
  "errors": []
}
```

The format is versioned and uses only the public Playwright Reporter API.
