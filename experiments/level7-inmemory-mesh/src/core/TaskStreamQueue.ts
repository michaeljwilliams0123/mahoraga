/**
 * EXPERIMENT ONLY — in-memory task stream queue.
 */
import type { DataTask } from "../types/framework";

export type { DataTask };

export class TaskStreamQueue {
  private executionBuffer: DataTask[] = [];
  private activeProcessingCount = 0;

  public pushTaskStream(payload: unknown): string {
    const taskId = `task_${Math.floor(Math.random() * 1_000_000)}`;
    this.executionBuffer.push({
      taskId,
      payload,
      timestamp: Date.now()
    });
    return taskId;
  }

  public pullNextAvailableTask(): DataTask | null {
    if (this.executionBuffer.length === 0) return null;
    this.activeProcessingCount += 1;
    return this.executionBuffer.shift() || null;
  }

  public markTaskComplete(): void {
    this.activeProcessingCount = Math.max(0, this.activeProcessingCount - 1);
  }

  public getQueueDepth(): number {
    return this.executionBuffer.length;
  }

  public getActiveProcessingCount(): number {
    return this.activeProcessingCount;
  }
}
