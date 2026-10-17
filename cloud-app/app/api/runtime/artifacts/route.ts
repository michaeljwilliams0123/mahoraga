import { authorizeOwnerMutation } from "@/lib/cloud-owner-gateway";
import { createRuntimeArtifactUploadHandler } from "@/lib/runtime-artifact-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRuntimeArtifactUploadHandler(authorizeOwnerMutation);
