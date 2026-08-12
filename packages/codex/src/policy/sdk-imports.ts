import ts from 'typescript';

export const CODEX_SDK_PACKAGE = '@openai/codex-sdk';

export interface SdkImportOccurrence {
  column: number;
  file: string;
  kind:
    | 'commonjs-require'
    | 'dynamic-import'
    | 'import-equals-require'
    | 're-export'
    | 'side-effect-import'
    | 'static-type-import'
    | 'static-value-import';
  line: number;
}

export interface SdkImportScanFile {
  path: string;
  source: string;
}

export interface SdkImportExclusivityReport {
  allowed: string;
  allowedOccurrences: number;
  occurrences: SdkImportOccurrence[];
  offenders: string[];
  scannedFiles: string[];
  selected: number;
  status: 'failed' | 'passed';
}

function location(
  source: string,
  index: number,
): { column: number; line: number } {
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function scriptKind(file: string): ts.ScriptKind {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.[cm]?jsx?$/i.test(file)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function targetLiteral(node: ts.Node | undefined): boolean {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === CODEX_SDK_PACKAGE
  );
}

export function scanSdkImportsInSource(
  file: string,
  source: string,
): SdkImportOccurrence[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const occurrences: SdkImportOccurrence[] = [];
  const add = (node: ts.Node, kind: SdkImportOccurrence['kind']): void => {
    occurrences.push({
      file,
      kind,
      ...location(source, node.getStart(sourceFile)),
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && targetLiteral(node.moduleSpecifier)) {
      add(
        node,
        node.importClause === undefined
          ? 'side-effect-import'
          : node.importClause.isTypeOnly
            ? 'static-type-import'
            : 'static-value-import',
      );
    } else if (
      ts.isExportDeclaration(node) &&
      targetLiteral(node.moduleSpecifier)
    ) {
      add(node, 're-export');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      targetLiteral(node.moduleReference.expression)
    ) {
      add(node, 'import-equals-require');
    } else if (ts.isCallExpression(node) && targetLiteral(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node, 'dynamic-import');
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        add(node, 'commonjs-require');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return occurrences;
}

export function evaluateSdkImportExclusivity(
  files: SdkImportScanFile[],
  allowed: string,
): SdkImportExclusivityReport {
  const scannedFiles = files.map((file) => file.path).sort();
  const occurrences = files
    .flatMap((file) => scanSdkImportsInSource(file.path, file.source))
    .sort((left, right) =>
      left.file === right.file
        ? left.line - right.line || left.column - right.column
        : left.file.localeCompare(right.file),
    );
  const allowedOccurrences = occurrences.filter(
    (occurrence) => occurrence.file === allowed,
  ).length;
  const offenders = [
    ...new Set(
      occurrences
        .filter((occurrence) => occurrence.file !== allowed)
        .map((occurrence) => occurrence.file),
    ),
  ].sort();
  return {
    allowed,
    allowedOccurrences,
    occurrences,
    offenders,
    scannedFiles,
    selected: occurrences.length,
    status:
      allowedOccurrences === 1 && offenders.length === 0 ? 'passed' : 'failed',
  };
}
