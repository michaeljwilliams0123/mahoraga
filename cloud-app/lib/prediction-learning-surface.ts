export type PredictionLearningSurface = {
  status: "observed" | "hold" | "absent";
  cycleFingerprint: string | null;
  predictionReceiptFingerprint: string | null;
  sampleCount: number | null;
  plannerTrust: number | null;
  evidenceSufficient: boolean;
  meanCalibrationGap: number | null;
  promotionClass: string | null;
  experienceAdjustedValue: number | null;
  reason: string;
};

const SHA256=/^[a-f0-9]{64}$/;
const obj=(value:unknown):Record<string,unknown>|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const hash=(value:unknown)=>typeof value==="string"&&SHA256.test(value)?value:null;
const bounded=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1?value:null;
const count=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;

export function projectPredictionLearningSurface(value: unknown): PredictionLearningSurface {
  const root=obj(value);
  if(!root) return empty("prediction-learning-unobserved");
  const cycle=obj(root.cycle);
  const prediction=obj(cycle?.predictionReceipt);
  const calibration=obj(root.calibrationSummary);
  const promotion=obj(root.promotion);
  const record=obj(promotion?.record);
  const planner=obj(root.plannerAction);
  const evidence=obj(planner?.evidence);
  const cycleFingerprint=hash(cycle?.fingerprint);
  const predictionReceiptFingerprint=hash(prediction?.fingerprint);
  const calibrationFingerprint=hash(calibration?.fingerprint);
  const plannerCalibrationFingerprint=hash(evidence?.calibrationSummaryFingerprint);
  const sampleCount=count(calibration?.sampleCount);
  const plannerTrust=bounded(calibration?.plannerTrust);
  const meanCalibrationGap=bounded(calibration?.meanCalibrationGap);
  const evidenceSufficient=calibration?.evidenceSufficient===true;
  const promotionClass=typeof record?.memoryClass==="string"&&new Set(["outcome","negative-memory","system-pattern"]).has(record.memoryClass)?record.memoryClass:null;
  const experienceAdjustedValue=typeof evidence?.experienceAdjustedValue==="number"&&Number.isFinite(evidence.experienceAdjustedValue)?evidence.experienceAdjustedValue:null;
  const complete=Boolean(cycleFingerprint&&predictionReceiptFingerprint&&calibrationFingerprint&&sampleCount!==null&&plannerTrust!==null&&meanCalibrationGap!==null&&promotion?.kind==="prediction-learning-promotion"&&promotion?.promotable===true&&promotionClass&&plannerCalibrationFingerprint===calibrationFingerprint&&experienceAdjustedValue!==null);
  if(!complete||!evidenceSufficient) return { status:"hold", cycleFingerprint, predictionReceiptFingerprint, sampleCount, plannerTrust, evidenceSufficient, meanCalibrationGap, promotionClass, experienceAdjustedValue, reason:evidenceSufficient?"prediction-learning-evidence-incomplete":"prediction-learning-evidence-insufficient" };
  return { status:"observed", cycleFingerprint, predictionReceiptFingerprint, sampleCount, plannerTrust, evidenceSufficient:true, meanCalibrationGap, promotionClass, experienceAdjustedValue, reason:"verified-prediction-learning-loop" };
}
function empty(reason:string):PredictionLearningSurface{return{status:"absent",cycleFingerprint:null,predictionReceiptFingerprint:null,sampleCount:null,plannerTrust:null,evidenceSufficient:false,meanCalibrationGap:null,promotionClass:null,experienceAdjustedValue:null,reason};}
