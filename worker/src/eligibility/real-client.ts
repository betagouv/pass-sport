import {
  Client,
  ApiGouvError,
  RateLimitError,
  type Response as ApiResponse,
} from "@api-gouv-dinum/api-particulier";
import type { ApiParticulierClient } from "./client";
import { CNOUS_IDENTITE_PATH, RESOURCE_META, toCnousParams, toDssParams, toQfParams } from "./client";
import type { ApiParticulierData, PivotIdentity, ResourceResult } from "./types";

export class RealClient implements ApiParticulierClient {
  private client: Client;

  constructor() {
    const token = process.env.API_PARTICULIER_TOKEN;
    if (!token) throw new Error("API_PARTICULIER_TOKEN is missing");

    const recipient = process.env.API_PARTICULIER_RECIPIENT_SIRET;
    if (!recipient) throw new Error("API_PARTICULIER_RECIPIENT_SIRET is missing");

    this.client = new Client({
      token,
      environment: process.env.API_PARTICULIER_ENV === "production" ? "production" : "staging",
      defaultParams: { recipient },
    });
  }

  // Normalizes success / 429 / other errors into a row.
  private async call(
    meta: { resource: string; label: string },
    invoke: () => Promise<ApiResponse>,
    childIndex?: number,
  ): Promise<ResourceResult> {
    try {
      const res = await invoke();

      // Surface rate-limit state so the sequence can throttle proactively, not just react to a 429.
      const resetSec = res.rateLimit?.retryAfter();

      return {
        ...meta,
        httpStatus: res.httpStatus,
        success: res.success,
        data: res.data as ApiParticulierData,
        childIndex,
        rateLimitRemaining: res.rateLimit?.remaining ?? null,
        rateLimitResetMs: resetSec != null ? resetSec * 1000 : null,
      };
    } catch (e) {
      if (e instanceof RateLimitError) {
        const retryAfter = e.retryAfter;

        return {
          ...meta,
          httpStatus: e.httpStatus ?? 429,
          success: false,
          data: null,
          rateLimited: true,
          retryAfter,
          rateLimitRemaining: 0,
          rateLimitResetMs: (retryAfter ?? 1) * 1000,
          requestUrl: e.url,
          childIndex,
        };
      }
      if (e instanceof ApiGouvError) {
        return {
          ...meta,
          httpStatus: e.httpStatus,
          success: false,
          data: null,
          error: e.firstErrorDetail ?? e.firstErrorTitle ?? e.message,
          requestUrl: e.url,
          childIndex,
        };
      }
      throw e; // unexpected — let the processor fail the job for real
    }
  }

  quotientFamilial(identity: PivotIdentity): Promise<ResourceResult> {
    return this.call(RESOURCE_META.qf, () =>
      this.client.dss.quotient_familial_identite(toQfParams(identity)),
    );
  }

  aah(identity: PivotIdentity): Promise<ResourceResult> {
    return this.call(RESOURCE_META.aah, () =>
      this.client.dss.allocation_adulte_handicape_identite(toDssParams(identity)),
    );
  }

  cnous(identity: PivotIdentity): Promise<ResourceResult> {
    // Generic GET: the SDK has no v5. It still merges defaultParams (recipient) and maps
    // errors, so the wrapper above behaves the same as on a resource method.
    return this.call(RESOURCE_META.cnous, () =>
      this.client.get(CNOUS_IDENTITE_PATH, { params: toCnousParams(identity) }),
    );
  }

  // SDK default v4: unlike the identite path there is no v5 for /ine, and v3 is deprecated.
  cnousByIne(ine: string): Promise<ResourceResult> {
    return this.call(RESOURCE_META.cnousIne, () => this.client.cnous.ine({ ine }));
  }

  aeeh(child: PivotIdentity, childIndex: number): Promise<ResourceResult> {
    return this.call(
      RESOURCE_META.aeeh,
      () => this.client.dss.allocation_enfant_handicape_identite(toDssParams(child)),
      childIndex,
    );
  }
}
