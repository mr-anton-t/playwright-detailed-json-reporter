export type JsonObject = {
    [key: string]: JsonValue;
};
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type ReportType = 'regular' | 'clean' | 'local' | '';
export type ReportMetadata = {
    [key: string]: JsonValue | undefined;
    productVersion?: string;
    productBranch?: string;
    edition?: string;
    type?: ReportType | null | undefined;
};
export interface ReporterOptions {
    outputFile?: string;
    artifactsDir?: string;
    includeSource?: boolean;
    sourceContextLines?: number;
    quiet?: boolean;
}
export interface SourceLocation {
    file: string;
    line: number;
    column: number;
}
export interface SourceCode {
    location: SourceLocation;
    snippet: string;
}
export interface ReportError {
    message: string;
    value?: string;
    stack?: string;
    snippet?: string;
    location?: SourceLocation;
    source?: SourceCode;
    cause?: ReportError;
}
export type AttachmentKind = 'trace' | 'screenshot' | 'video' | 'text' | 'other';
export type ScreenshotRole = 'expected' | 'actual' | 'diff';
export interface ReportAttachment {
    id: string;
    name: string;
    contentType: string;
    kind: AttachmentKind;
    screenshotRole?: ScreenshotRole;
    snapshotName?: string;
    path?: string;
    missing?: boolean;
}
export interface OutputChunk {
    encoding: 'utf8' | 'base64';
    value: string;
}
export interface ReportAnnotation {
    type: string;
    description?: string;
    location?: SourceLocation;
}
export interface ReportStep {
    title: string;
    category: string;
    status: 'passed' | 'failed' | 'skipped';
    startTime: string;
    duration: number;
    location?: SourceLocation;
    source?: SourceCode;
    error?: ReportError;
    annotations: ReportAnnotation[];
    attachments: ReportAttachment[];
    steps: ReportStep[];
}
export interface TestAttempt {
    retry: number;
    workerIndex: number;
    parallelIndex: number;
    status: string;
    startTime: string;
    duration: number;
    errors: ReportError[];
    annotations: ReportAnnotation[];
    stdout: OutputChunk[];
    stderr: OutputChunk[];
    attachments: ReportAttachment[];
    steps: ReportStep[];
}
export interface ReportTest {
    id: string;
    title: string;
    titlePath: string[];
    location: SourceLocation;
    source?: SourceCode;
    projectId: string;
    projectName: string;
    tags: string[];
    annotations: ReportAnnotation[];
    expectedStatus: string;
    timeout: number;
    outcome: string;
    results: TestAttempt[];
}
export interface ReportSuite {
    title: string;
    location?: SourceLocation;
    suites: ReportSuite[];
    tests: ReportTest[];
}
export interface DetailedJsonReport {
    schemaName: 'playwright-detailed-json';
    schemaVersion: 1;
    generatedAt: string;
    config: {
        rootDir: string;
        configFile?: string;
        workers: number;
        metadata: ReportMetadata;
    };
    run: {
        status: string;
        startTime: string;
        duration: number;
    };
    projects: Array<{
        name: string;
        outputDir: string;
        testDir: string;
        retries: number;
        repeatEach: number;
        timeout: number;
    }>;
    suites: ReportSuite[];
    errors: ReportError[];
}
