import { Module } from "@nestjs/common";
import { NlpearlService } from "./nlpearl.service";

@Module({
  providers: [NlpearlService],
  exports: [NlpearlService],
})
export class NlpearlModule {}
