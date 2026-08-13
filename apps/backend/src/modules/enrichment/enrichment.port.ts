import { FlowTriggerPayload } from "@nlpearl/shared-types";

export const RECORD_ENRICHMENT_PORT = "RECORD_ENRICHMENT_PORT";

/**
 * Seam for stage 2: enriching/validating an inbound N8N record against
 * PayMe's data lake or SQL warehouse before it's used. Stage 1 uses
 * PassthroughEnrichmentService; swap the DI binding below for a real
 * data-lake-backed implementation later — nothing else in the ingest
 * pipeline needs to change.
 */
export interface RecordEnrichmentPort {
  enrich(record: FlowTriggerPayload): Promise<FlowTriggerPayload>;
}
