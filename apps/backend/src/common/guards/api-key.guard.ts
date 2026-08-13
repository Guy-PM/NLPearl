import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";

/**
 * Generic shared-secret guard: compares the `x-api-key` header against
 * an env var. Used to gate the two categories of inbound webhook
 * (N8N, NLPearl) — each has its own env var since they're independent
 * secrets configured on independent third-party systems.
 */
export function createApiKeyGuard(envVar: string) {
  @Injectable()
  class ApiKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const provided = request.header("x-api-key");
      const expected = process.env[envVar];

      if (!expected) {
        throw new UnauthorizedException(`${envVar} is not configured`);
      }
      if (!provided || provided !== expected) {
        throw new UnauthorizedException("Invalid or missing X-Api-Key header");
      }
      return true;
    }
  }
  return ApiKeyGuard;
}
