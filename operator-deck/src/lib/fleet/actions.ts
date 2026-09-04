import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const commandSchema = z.object({
  command: z.string().min(1).max(800),
});

export const executeDirective = createServerFn({ method: "POST" })
  .validator(commandSchema)
  .handler(async ({ data }) => {
    const { runDirective } = await import("./execute.server");
    return runDirective(data.command);
  });

export const getGithubSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { loadGithubSnapshot } = await import("./github.server");
  return loadGithubSnapshot();
});
