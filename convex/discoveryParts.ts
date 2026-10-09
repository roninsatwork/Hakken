import { readsAsShown } from "./seoAiEngines";
import { isAiDemandOperation } from "./dataForSeoAiDemandOperations";
import { isRadarOperation } from "./dataForSeoRadarOperations";
import { isMentionOperation } from "./dataForSeoMentionOperations";
import type { CollectionPart } from "./collectionParts";
import { isLocalOperation } from "./dataForSeoLocalOperations";
import { isReviewOperation } from "./dataForSeoReviewOperations";

/**
 * Which of Discovery's held parts a purchase belongs to (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, D16), or null for one that is not
 * held by a part: the queue keeps a held purchase while its part is on for a
 * company asking it, whatever that company's collection schedule says.
 */
export function discoveryPartOf(operationId: string): CollectionPart | null {
  if (isLocalOperation(operationId)) return "local";
  if (isReviewOperation(operationId)) return "reviews";
  // The two apps read as shown and Google AI Mode (D5, D17).
  if (readsAsShown(operationId)) return "aiApps";
  if (isAiDemandOperation(operationId)) return "aiDemand";
  if (isRadarOperation(operationId)) return "brandRadar";
  if (isMentionOperation(operationId)) return "webMentions";
  return null;
}
