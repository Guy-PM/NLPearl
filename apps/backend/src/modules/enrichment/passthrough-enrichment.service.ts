import { Injectable } from "@nestjs/common";
import { FlowTriggerPayload } from "@nlpearl/shared-types";
import { RecordEnrichmentPort } from "./enrichment.port";

@Injectable()
export class PassthroughEnrichmentService implements RecordEnrichmentPort {
  async enrich(record: FlowTriggerPayload): Promise<FlowTriggerPayload> {
    return record;
  }
}
