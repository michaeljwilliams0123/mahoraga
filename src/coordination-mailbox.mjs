import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { validateAssignmentRecord } from "./coordination-records.mjs";

export function loadCoordinationAssignments(root = ROOT) {
  const directory = path.join(root, "coordination", "assignments");
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const record = validateAssignmentRecord(JSON.parse(readFileSync(path.join(directory, entry.name), "utf8")));
      if (entry.name !== `${record.assignmentId}.json`) throw new TypeError(`Assignment filename does not match its ID: ${entry.name}`);
      return record;
    });
}

export function syncCoordinationAssignments(database, root = ROOT) {
  const assignments = loadCoordinationAssignments(root);
  const imported = [];
  for (const assignment of assignments) {
    const before = database.getSecondaryAssignment(assignment.assignmentId);
    const current = database.importSecondaryAssignment(assignment);
    if (!before) imported.push(current.id);
  }
  return Object.freeze({ scanned: assignments.length, imported: Object.freeze(imported) });
}
