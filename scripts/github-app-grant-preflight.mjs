import { proveGithubAppNativeGrants } from "../src/github-native-client.mjs";

// GitHub Actions exact-main predeployment boundary: no repo mutation, no secrets in output.
const result = await proveGithubAppNativeGrants();
process.stdout.write(`${JSON.stringify(result)}\n`);
