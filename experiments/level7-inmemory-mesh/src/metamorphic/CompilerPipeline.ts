/**
 * EXPERIMENT ONLY — transpile + evaluate path for hot-swap.
 *
 * DANGEROUS: evaluateModule uses the Function constructor (no Node vm timeout
 * enforcement here). Treat all evolvedSource as untrusted. Prefer L7_WORKERS=0
 * for local smoke. Do not wire this into production Mahoraga control plane.
 */
import * as ts from "typescript";
import type { EvaluatedModule } from "../types/framework";

export class MetamorphicCompilerPipeline {
  /**
   * Transpile TypeScript-ish source to CommonJS-ish JS in memory.
   */
  public static compileToMemory(sourceCode: string): string {
    const stripped = sourceCode
      // Drop experiment snapshot headers
      .replace(/^\/\/ L7 snapshot[^\n]*\n/gm, "");

    const result = ts.transpileModule(stripped, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        strict: false
      },
      reportDiagnostics: true,
      fileName: "volatile_variant.ts"
    });

    if (result.diagnostics && result.diagnostics.length > 0) {
      const msg = result.diagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
        .join("; ");
      // Soft-fail: still return JS when possible; callers may catch evaluate errors.
      console.warn(`[CompilerPipeline] transpile diagnostics: ${msg}`);
    }

    return result.outputText;
  }

  /**
   * DANGEROUS — evaluates compiled JS and returns `{ execute }`.
   * Uses Function constructor sandbox (not a true security boundary).
   * No hard timeout is enforced; callers should bound mutation intervals.
   */
  public static evaluateModule(compiledJs: string, nodeId: string): EvaluatedModule {
    const wrapped = `
      const module = { exports: {} };
      const exports = module.exports;
      ${compiledJs}
      return module.exports;
    `;

    // eslint-disable-next-line no-new-func -- intentional experiment hot-swap path
    const factory = new Function(wrapped) as () => Record<string, unknown>;
    const exportsObj = factory() || {};

    let execute = exportsObj.execute as EvaluatedModule["execute"] | undefined;

    if (typeof execute !== "function") {
      // Fallback: treat default export or sole function export as execute.
      const def = exportsObj.default;
      if (typeof def === "function") {
        execute = def as EvaluatedModule["execute"];
      } else {
        const firstFn = Object.values(exportsObj).find((v) => typeof v === "function");
        if (typeof firstFn === "function") {
          execute = firstFn as EvaluatedModule["execute"];
        }
      }
    }

    if (typeof execute !== "function") {
      throw new Error(
        `[CompilerPipeline] evaluateModule(${nodeId}): no callable execute export found`
      );
    }

    console.log(`[CompilerPipeline] DANGEROUS evaluateModule OK for [${nodeId}]`);
    return { ...exportsObj, execute };
  }
}
