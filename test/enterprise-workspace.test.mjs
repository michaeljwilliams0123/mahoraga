import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEnterpriseWorkspace } from "../src/enterprise-workspace.mjs";

function fixture(t) {
  const base = mkdtempSync(path.join(os.tmpdir(), "mahoraga-enterprise-"));
  const repository = path.join(base, "repository");
  const enterprise = path.join(base, "approved");
  const outside = path.join(base, "outside");
  mkdirSync(repository);
  mkdirSync(enterprise);
  mkdirSync(outside);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return { base, repository, enterprise, outside };
}

async function workspaceFor(t, options = {}) {
  const paths = fixture(t);
  const workspace = await createEnterpriseWorkspace({
    roots: [{ label: "Approved Finance", path: paths.enterprise }],
    repositoryRoot: paths.repository,
    ...options,
  });
  return { ...paths, workspace, rootId: workspace.listRoots()[0].id };
}

test("enterprise workspace registers an approved file with an opaque in-memory handle", async (t) => {
  const { enterprise, workspace, rootId } = await workspaceFor(t);
  mkdirSync(path.join(enterprise, "reports"));
  writeFileSync(path.join(enterprise, "reports", "controls.xlsx"), "bounded-test-content");

  const asset = await workspace.registerAsset({ rootId, relativePath: path.join("reports", "controls.xlsx") });
  assert.match(asset.id, /^ewa-[a-f0-9-]+$/);
  assert.equal(asset.displayName, "controls.xlsx");
  assert.equal(asset.extension, ".xlsx");
  assert.equal(asset.size, 20);
  assert.doesNotMatch(asset.id, /controls|reports/i);
  assert.deepEqual(workspace.getAsset(asset.id), { id: asset.id, rootId, registered: true });
  assert.equal(JSON.stringify(workspace), "{}");

  const opened = await workspace.openAsset(asset.id);
  t.after(() => opened.handle.close());
  assert.deepEqual(Object.keys(opened.metadata).sort(), ["extension", "id", "modifiedAt", "rootId", "size"]);
  assert.equal((await opened.handle.readFile("utf8")), "bounded-test-content");
  assert.equal(workspace.forgetAsset(asset.id), true);
  assert.equal(workspace.getAsset(asset.id), null);
});

test("enterprise workspace rejects repository and overlapping roots", async (t) => {
  const { base, repository, enterprise } = fixture(t);
  await assert.rejects(
    createEnterpriseWorkspace({ roots: [{ label: "Repository", path: repository }], repositoryRoot: repository }),
    /cannot overlap the Mahoraga repository/,
  );
  await assert.rejects(
    createEnterpriseWorkspace({ roots: [{ label: "Parent", path: base }], repositoryRoot: repository }),
    /cannot overlap the Mahoraga repository/,
  );
  mkdirSync(path.join(enterprise, "nested"));
  await assert.rejects(
    createEnterpriseWorkspace({
      roots: [
        { label: "Approved", path: enterprise },
        { label: "Nested", path: path.join(enterprise, "nested") },
      ],
      repositoryRoot: repository,
    }),
    /cannot overlap each other/,
  );
});

test("enterprise workspace rejects traversal, unsafe types, directories, and oversize files", async (t) => {
  const { enterprise, outside, workspace, rootId } = await workspaceFor(t, { maximumBytes: 10 });
  writeFileSync(path.join(outside, "secret.pdf"), "outside");
  writeFileSync(path.join(enterprise, "unsafe.exe"), "unsafe");
  writeFileSync(path.join(enterprise, "large.pdf"), "01234567890");
  mkdirSync(path.join(enterprise, "folder"));

  await assert.rejects(workspace.registerAsset({ rootId, relativePath: path.join("..", "outside", "secret.pdf") }), /traversal/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: "unsafe.exe" }), /type is not approved/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: "report.pdf:payload.pdf" }), /traversal/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: "CON.pdf" }), /traversal/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: "large.pdf" }), /size limit/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: "folder" }), /regular file/);
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: path.join(enterprise, "large.pdf") }), /path is invalid/);
});

test("enterprise workspace rejects symbolic-link and junction escapes", async (t) => {
  const { enterprise, outside, workspace, rootId } = await workspaceFor(t);
  writeFileSync(path.join(outside, "secret.pdf"), "outside");
  const link = path.join(enterprise, "linked");
  try {
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("This Windows account cannot create the junction needed for the boundary test.");
      return;
    }
    throw error;
  }
  await assert.rejects(workspace.registerAsset({ rootId, relativePath: path.join("linked", "secret.pdf") }), /symbolic link/);
});

test("enterprise workspace revalidates registered assets before opening them", async (t) => {
  const { enterprise, workspace, rootId } = await workspaceFor(t, { maximumBytes: 20 });
  const file = path.join(enterprise, "evidence.pdf");
  writeFileSync(file, "safe");
  const asset = await workspace.registerAsset({ rootId, relativePath: "evidence.pdf" });
  writeFileSync(file, "this replacement is now too large");
  await assert.rejects(workspace.openAsset(asset.id), /size limit/);
});
