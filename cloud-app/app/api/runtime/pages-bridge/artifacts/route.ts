import { authorizePagesBridgeMutation } from "@/lib/pages-owner-bridge";
import { createRuntimeArtifactUploadHandler } from "@/lib/runtime-artifact-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRuntimeArtifactUploadHandler(authorizePagesBridgeMutation);
