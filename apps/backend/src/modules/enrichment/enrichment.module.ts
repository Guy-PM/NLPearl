import { Module } from "@nestjs/common";
import { RECORD_ENRICHMENT_PORT } from "./enrichment.port";
import { PassthroughEnrichmentService } from "./passthrough-enrichment.service";

@Module({
  providers: [{ provide: RECORD_ENRICHMENT_PORT, useClass: PassthroughEnrichmentService }],
  exports: [RECORD_ENRICHMENT_PORT],
})
export class EnrichmentModule {}
