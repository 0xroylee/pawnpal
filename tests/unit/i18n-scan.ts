import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type Finding = { file: string; line: number; message: string };

const defaultRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const translatableAttributes = new Set([
  "aria-label",
  "title",
  "alt",
  "placeholder",
]);
const nonWords = /^[^\p{L}]*$/u;

async function tsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await tsxFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

export async function scanWebStrings(root = defaultRoot): Promise<Finding[]> {
  const messages = JSON.parse(
    await readFile(resolve(root, "src/web/i18n/en.json"), "utf8"),
  ) as Record<string, string>;
  const keys = new Set(Object.keys(messages));
  const files = await tsxFiles(resolve(root, "src/web"));
  const findings: Finding[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const addFinding = (node: ts.Node, message: string) => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      findings.push({ file: relative(root, file), line: line + 1, message });
    };

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text.trim())) {
        addFinding(node, `Untranslated JSX text: ${node.text.trim()}`);
      }
      if (
        ts.isJsxAttribute(node) &&
        ts.isIdentifier(node.name) &&
        translatableAttributes.has(node.name.text)
      ) {
        const value = node.initializer;
        if (value && ts.isStringLiteral(value) && !nonWords.test(value.text)) {
          addFinding(node, `Untranslated ${node.name.text}: ${value.text}`);
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        !keys.has(node.arguments[0].text)
      ) {
        addFinding(
          node,
          `Missing English message key: ${node.arguments[0].text}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return findings;
}
