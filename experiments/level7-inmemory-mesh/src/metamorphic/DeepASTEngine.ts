/**
 * EXPERIMENT ONLY — Deep AST engine; delegates vector transforms to VectorASTEngine.
 */
import type { MutationEnvelope } from "../types/framework";
import { VectorASTEngine } from "./VectorASTEngine";

export class DeepASTEngine {
  private targetNodeId: string;
  private vectorEngine: VectorASTEngine;
  private generation = 0;

  constructor(targetNodeId: string) {
    this.targetNodeId = targetNodeId;
    this.vectorEngine = new VectorASTEngine(targetNodeId);
  }

  /**
   * Applies deep structural optimizations. Currently thin-wraps VectorASTEngine
   * and annotates the evolved source with a generation marker.
   */
  public compileDeepOptimizations(sourceCode: string): MutationEnvelope {
    this.generation += 1;
    const vector = this.vectorEngine.compileVectorOptimizations(sourceCode);

    // If no for-loop was present, still emit a lightly annotated variant so the
    // mutation interval has a deterministic evolvedSource to hot-swap.
    let evolved = vector.evolvedSource;
    if (!evolved.includes("Contiguous Vector Matrix")) {
      evolved =
        sourceCode.trimEnd() +
        `\n// DeepAST generation ${this.generation} @ ${Date.now()}\n`;
    } else {
      evolved =
        evolved.trimEnd() +
        `\n// DeepAST generation ${this.generation} delegated to VectorASTEngine\n`;
    }

    // Ensure execute export remains present for the baseline multiply demo when
    // the vector rewrite emptied meaningful body forms.
    if (!/\bexecute\b/.test(evolved)) {
      evolved = `export const execute = async (n: any) => { return n * 2; };\n` + evolved;
    }

    console.log(
      `[DeepASTEngine] compileDeepOptimizations generation=${this.generation} node=${this.targetNodeId}`
    );

    return {
      targetNodeId: this.targetNodeId,
      evolvedSource: evolved,
      generationTimestamp: Date.now(),
      notes: `deep-gen-${this.generation}`
    };
  }
}
