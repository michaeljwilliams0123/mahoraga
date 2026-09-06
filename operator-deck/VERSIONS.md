# Version ledger

Mahoraga is three surfaces. Use the **operator console** for GitHub work so you are not aligning three UIs.

| Surface | Version | Host | Language | What it is |
|---|---|---|---|---|
| Windows production | `3.6.0` | Loopback `127.0.0.1:4782` on the Windows host | Existing Node.js control plane | Live rollback. Never replace with 7.0 from a cloud UI. SHA `397acebf16766f44e3b4317f9d8b68b10de5f821`. |
| Conversation workspace | `7.0.0-alpha.2` | Vercel `mahoraga-cloud-workspace` | TypeScript (Next.js `cloud-app/`) | ChatGPT-style Cloud Pro workspace. Not the Windows PID. |
| Operator console | `fleet-1` | Vercel (this deck) | TypeScript (TanStack Start) | Singular operator UI: inspect, merge, comment, close, dispatch, delete eligible contained branches. |

## Host decision

**Vercel** hosts both browser UIs. Google Workspace is identity, mail, and docs. It is not an application host.

## Language lock

TypeScript for all new UI. Do not rewrite TypeScript to JavaScript or Java. Do not rewrite the existing Node.js `.mjs` control plane to JavaScript, Java, or TypeScript. Java only if a new Java service is started on purpose. See [`docs/ECOSYSTEM-LOCK.md`](../docs/ECOSYSTEM-LOCK.md).


## Write plane

Owner GitHub writes run from the operator console through the connected `gh` session. Merge refuses unless `mergeStateStatus` is `CLEAN` (Protect main: exact-head Verify on Ubuntu and Windows). Unified Vercel workspace Verify may run and must not gate merge. Wave A deletes preview first and skip anything `ahead_by != 0`, anything with an open PR, and `main`. Destiny spend and Windows 7.0 activate remain hard denies.
