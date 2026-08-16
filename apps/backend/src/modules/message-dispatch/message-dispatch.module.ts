import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { SchedulerModule } from "../scheduler/scheduler.module";
import { MessageDispatchService } from "./message-dispatch.service";

@Module({
  imports: [NotificationModule, SchedulerModule],
  providers: [MessageDispatchService],
  exports: [MessageDispatchService],
})
export class MessageDispatchModule {}
