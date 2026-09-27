"use client";

import { useEffect, useState } from "react";
import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { projectInteractionReadiness, projectZeroCreditAdmission } from "@/lib/interaction-readiness";
import { projectCognitiveLearningSurface } from "@/lib/cognitive-learning-surface";
import type { CollectiveDissentReceipt } from "@/lib/dissent-receipt";
import type { CockpitViewProps, HardZeroQuotaAction, HardZeroQuotaReceipt, Health, SanitizedAcceptanceReceipt } from "../workspace/workspace-types";
import { DissentReceiptPanel } from "./DissentReceiptPanel";
