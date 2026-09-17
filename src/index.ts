import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

import type {
  AttachmentKind,
  DetailedJsonReport,
  JsonObject,
  JsonValue,
  OutputChunk,
  ReportAnnotation,
  ReportAttachment,
  ReportError,
  ReporterOptions,
  ReportStep,
  ReportSuite,
  ReportTest,
  ScreenshotRole,
  SourceCode,
  SourceLocation,
  TestAttempt,
} from './types.js';

export type { DetailedJsonReport, ReporterOptions, ReportMetadata, ReportType } from './types.js';

type Attachment = TestResult['attachments'][number];

const slash = (value: string) => value.split(sep).join('/');
const cleanName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';

export default class DetailedJsonReporter implements Reporter {
  private readonly options: Required<ReporterOptions>;
  private config?: FullConfig;
  private rootSuite?: Suite;
  private readonly globalErrors: TestError[] = [];
  private readonly sourceCache = new Map<string, Promise<string[] | undefined>>();
  private readonly artifactCache = new Map<string, Promise<ReportAttachment>>();
  private outputFile = '';
  private artifactsDir = '';

  constructor(options: ReporterOptions = {}) {
    this.options = {
      outputFile: options.outputFile ?? 'playwright-report/report.json',
      artifactsDir: options.artifactsDir ?? '',
      includeSource: options.includeSource ?? true,
      sourceContextLines: options.sourceContextLines ?? 3,
      quiet: options.quiet ?? false,
    };
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.rootSuite = suite;
    const configDir = config.configFile ? dirname(config.configFile) : config.rootDir;
    this.outputFile = resolve(configDir, this.options.outputFile);
    this.artifactsDir = this.options.artifactsDir
      ? resolve(configDir, this.options.artifactsDir)
      : resolve(dirname(this.outputFile), 'artifacts');
  }

  onError(error: TestError) {
    this.globalErrors.push(error);
  }

  async onEnd(result: FullResult) {
    if (!this.config || !this.rootSuite) throw new Error('Playwright called onEnd before onBegin');

    await mkdir(dirname(this.outputFile), { recursive: true });
    await mkdir(this.artifactsDir, { recursive: true });

    const report: DetailedJsonReport = {
      schemaName: 'playwright-detailed-json',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      config: {
        rootDir: slash(this.config.rootDir),
        ...(this.config.configFile ? { configFile: slash(this.config.configFile) } : {}),
        workers: this.config.workers,
        metadata: this.jsonObject(this.config.metadata),
      },
      run: {
        status: result.status,
        startTime: result.startTime.toISOString(),
        duration: result.duration,
      },
      projects: this.config.projects.map((project) => ({
        name: project.name,
        outputDir: slash(project.outputDir),
        testDir: slash(project.testDir),
        retries: project.retries,
        repeatEach: project.repeatEach,
        timeout: project.timeout,
      })),
      suites: await Promise.all(this.rootSuite.suites.map((suite) => this.serializeSuite(suite))),
      errors: await Promise.all(this.globalErrors.map((error) => this.serializeError(error))),
    };

    await writeFile(this.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (!this.options.quiet) process.stdout.write(`Detailed JSON report written to ${this.outputFile}\n`);
  }

  printsToStdio() {
    return !this.options.quiet;
  }

  private async serializeSuite(suite: Suite): Promise<ReportSuite> {
    return {
      title: suite.title,
      ...(suite.location ? { location: this.location(suite.location) } : {}),
      suites: await Promise.all(suite.suites.map((child) => this.serializeSuite(child))),
      tests: await Promise.all(suite.tests.map((test) => this.serializeTest(test))),
    };
  }

  private async serializeTest(test: TestCase): Promise<ReportTest> {
    const project = test.parent.project();
    const source = await this.source(test.location);
    return {
      id: test.id,
      title: test.title,
      titlePath: test.titlePath(),
      location: this.location(test.location),
      ...(source ? { source } : {}),
      projectId: project?.name ?? '',
      projectName: project?.name ?? '',
      tags: [...test.tags],
      annotations: test.annotations.map((annotation) => this.annotation(annotation)),
      expectedStatus: test.expectedStatus,
      timeout: test.timeout,
      outcome: test.outcome(),
      results: await Promise.all(test.results.map((result) => this.serializeResult(test, result))),
    };
  }

  private async serializeResult(test: TestCase, result: TestResult): Promise<TestAttempt> {
    return {
      retry: result.retry,
      workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex,
      status: result.status,
      startTime: result.startTime.toISOString(),
      duration: result.duration,
      errors: await Promise.all(result.errors.map((error) => this.serializeError(error))),
      annotations: result.annotations.map((annotation) => this.annotation(annotation)),
      stdout: result.stdout.map((chunk) => this.outputChunk(chunk)),
      stderr: result.stderr.map((chunk) => this.outputChunk(chunk)),
      attachments: await Promise.all(result.attachments.map((attachment) => this.attachment(test, result, attachment))),
      steps: await Promise.all(result.steps.map((step) => this.serializeStep(test, result, step))),
    };
  }

  private async serializeStep(test: TestCase, result: TestResult, step: TestStep): Promise<ReportStep> {
    const source = step.location ? await this.source(step.location) : undefined;
    const error = step.error ? await this.serializeError(step.error) : undefined;
    return {
      title: step.title,
      category: step.category,
      status: error ? 'failed' : step.duration < 0 ? 'skipped' : 'passed',
      startTime: step.startTime.toISOString(),
      duration: step.duration,
      ...(step.location ? { location: this.location(step.location) } : {}),
      ...(source ? { source } : {}),
      ...(error ? { error } : {}),
      annotations: step.annotations.map((annotation) => this.annotation(annotation)),
      attachments: await Promise.all(step.attachments.map((attachment) => this.attachment(test, result, attachment))),
      steps: await Promise.all(step.steps.map((child) => this.serializeStep(test, result, child))),
    };
  }

  private async serializeError(error: TestError): Promise<ReportError> {
    const source = error.location ? await this.source(error.location) : undefined;
    const cause = error.cause ? await this.serializeError(error.cause) : undefined;
    return {
      message: error.message ?? error.value ?? 'Unknown error',
      ...(error.value ? { value: error.value } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.snippet ? { snippet: error.snippet } : {}),
      ...(error.location ? { location: this.location(error.location) } : {}),
      ...(source ? { source } : {}),
      ...(cause ? { cause } : {}),
    };
  }

  private annotation(annotation: { type: string; description?: string; location?: SourceLocation }): ReportAnnotation {
    return {
      type: annotation.type,
      ...(annotation.description ? { description: annotation.description } : {}),
      ...(annotation.location ? { location: this.location(annotation.location) } : {}),
    };
  }

  private async attachment(test: TestCase, result: TestResult, attachment: Attachment): Promise<ReportAttachment> {
    const contentKey = attachment.path
      ? `path:${resolve(attachment.path)}`
      : `body:${attachment.contentType}:${createHash('sha256').update(attachment.body ?? '').digest('hex')}`;
    const sourceKey = `${test.id}:retry-${result.retry}:${attachment.name}:${attachment.contentType}:${contentKey}`;
    const cached = this.artifactCache.get(sourceKey);
    if (cached) return cached;

    const pending = this.storeAttachment(test, result, attachment, sourceKey);
    this.artifactCache.set(sourceKey, pending);
    return pending;
  }

  private async storeAttachment(
    test: TestCase,
    result: TestResult,
    attachment: Attachment,
    sourceKey: string,
  ): Promise<ReportAttachment> {
    const kind = this.attachmentKind(attachment);
    const screenshotRole = kind === 'screenshot' ? this.screenshotRole(attachment.name) : undefined;
    const suffix = createHash('sha256').update(sourceKey).digest('hex').slice(0, 16);
    const originalName = attachment.path ? basename(attachment.path) : attachment.name;
    const extension = extname(originalName) || this.extension(attachment.contentType);
    const stem = cleanName(extension ? originalName.slice(0, -extension.length) : originalName);
    const testFolder = cleanName(test.id);
    const snapshotName = screenshotRole ? this.snapshotName(attachment, screenshotRole) : undefined;
    const fileName = snapshotName ?? `${stem}-${suffix}${extension}`;
    const destination = resolve(
      this.artifactsDir,
      testFolder,
      `retry-${result.retry}`,
      ...(screenshotRole ? ['screenshots', screenshotRole] : []),
      fileName,
    );
    const id = `${test.id}:retry-${result.retry}:${suffix}`;
    const common = {
      id,
      name: attachment.name,
      contentType: attachment.contentType,
      kind,
      ...(screenshotRole ? { screenshotRole } : {}),
      ...(snapshotName ? { snapshotName } : {}),
    };

    try {
      await mkdir(dirname(destination), { recursive: true });
      if (attachment.path) {
        if (resolve(attachment.path) !== destination) await copyFile(attachment.path, destination);
      } else if (attachment.body) {
        await writeFile(destination, attachment.body);
      } else {
        return { ...common, missing: true };
      }
      return { ...common, path: slash(relative(dirname(this.outputFile), destination)) };
    } catch {
      return { ...common, missing: true };
    }
  }

  private attachmentKind(attachment: Attachment): AttachmentKind {
    const name = attachment.name.toLowerCase();
    const extension = attachment.path ? extname(attachment.path).toLowerCase() : '';
    if (name === 'trace' || extension === '.zip' && name.includes('trace')) return 'trace';
    if (attachment.contentType.startsWith('image/')) return 'screenshot';
    if (attachment.contentType.startsWith('video/')) return 'video';
    if (attachment.contentType.startsWith('text/') || attachment.contentType.includes('json')) return 'text';
    return 'other';
  }

  private screenshotRole(name: string): ScreenshotRole | undefined {
    const normalized = name.toLowerCase();
    if (normalized.includes('expected')) return 'expected';
    if (normalized.includes('actual')) return 'actual';
    if (normalized.includes('diff')) return 'diff';
    return undefined;
  }

  private snapshotName(attachment: Attachment, role: ScreenshotRole) {
    if (role === 'expected' && attachment.path) return basename(attachment.path);
    const extension = extname(attachment.name) || this.extension(attachment.contentType);
    const stem = extension ? attachment.name.slice(0, -extension.length) : attachment.name;
    return basename(`${stem.replace(new RegExp(`-${role}$`, 'i'), '')}${extension}`);
  }

  private extension(contentType: string) {
    const extensions: Record<string, string> = {
      'application/json': '.json',
      'application/zip': '.zip',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'text/markdown': '.md',
      'text/plain': '.txt',
      'video/webm': '.webm',
    };
    return extensions[contentType.split(';', 1)[0] ?? ''] ?? '';
  }

  private outputChunk(chunk: string | Buffer): OutputChunk {
    if (typeof chunk === 'string') return { encoding: 'utf8', value: chunk };
    const value = chunk.toString('utf8');
    return Buffer.from(value, 'utf8').equals(chunk)
      ? { encoding: 'utf8', value }
      : { encoding: 'base64', value: chunk.toString('base64') };
  }

  private location(location: { file: string; line: number; column: number }): SourceLocation {
    const file = this.config && isAbsolute(location.file) ? relative(this.config.rootDir, location.file) : location.file;
    return { file: slash(file), line: location.line, column: location.column };
  }

  private async source(location: { file: string; line: number; column: number }): Promise<SourceCode | undefined> {
    if (!this.options.includeSource) return undefined;
    const file = isAbsolute(location.file) ? location.file : resolve(this.config?.rootDir ?? process.cwd(), location.file);
    let pending = this.sourceCache.get(file);
    if (!pending) {
      pending = readFile(file, 'utf8').then((content) => content.split(/\r?\n/)).catch(() => undefined);
      this.sourceCache.set(file, pending);
    }
    const lines = await pending;
    if (!lines || location.line < 1 || location.line > lines.length) return undefined;
    const first = Math.max(1, location.line - this.options.sourceContextLines);
    const last = Math.min(lines.length, location.line + this.options.sourceContextLines);
    const width = String(last).length;
    const snippet = lines.slice(first - 1, last).map((line, index) => {
      const number = first + index;
      return `${number === location.line ? '>' : ' '} ${String(number).padStart(width)} | ${line}`;
    }).join('\n');
    return { location: this.location(location), snippet };
  }

  private jsonValue(value: unknown): JsonValue {
    try {
      return JSON.parse(JSON.stringify(value)) as JsonValue;
    } catch {
      return {};
    }
  }

  private jsonObject(value: unknown): JsonObject {
    const serialized = this.jsonValue(value);
    return serialized !== null && typeof serialized === 'object' && !Array.isArray(serialized) ? serialized : {};
  }
}
