import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import {
  GetAccountResponse,
  GetCallResponse,
  MakeCallRequest,
  MakeCallResponse,
} from "./nlpearl.types";

/**
 * Client for the NLPearl API (https://developers.nlpearl.ai).
 * Auth: `Authorization: Bearer <token>`, base URL `https://api.nlpearl.ai`.
 */
@Injectable()
export class NlpearlService {
  private readonly logger = new Logger(NlpearlService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.getOrThrow<string>("NLPEARL_API_BASE_URL"),
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>("NLPEARL_API_KEY")}`,
      },
      timeout: 15_000,
    });
  }

  /** POST /v1/Outbound/{outboundId}/Call */
  async makeCall(outboundId: string, request: MakeCallRequest): Promise<MakeCallResponse> {
    const { data } = await this.http.post<MakeCallResponse>(
      `/v1/Outbound/${outboundId}/Call`,
      request,
    );
    this.logger.log(`NLPearl call requested: outbound=${outboundId} id=${data.id}`);
    return data;
  }

  /** GET /v2/Call/{callId} */
  async getCall(callId: string): Promise<GetCallResponse> {
    const { data } = await this.http.get<GetCallResponse>(`/v2/Call/${callId}`);
    return data;
  }

  /** GET /v1/Account — used for the health check. */
  async getAccount(): Promise<GetAccountResponse> {
    const { data } = await this.http.get<GetAccountResponse>("/v1/Account");
    return data;
  }
}
