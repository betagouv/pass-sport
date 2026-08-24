import z, { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import { enqueueLcaJob, type LcaHistoryEvent, type LcaJobData } from '@/app/services/queue';
import { SITUATION, type Situation } from '@/app/services/eligibility-job';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';
import { handleSupportCookie } from '@/utils/cookie';
import { getClientIp } from '@/utils/client-ip';
import {
  LCA_SITUATION,
  ORGANISME,
  type ConfirmResponseBodyItem,
  type OrganismType,
  type SearchResponseBodyItem,
  type SituationType,
  type VerdictResponseBody,
} from '@/types/EligibilityTest';

// CROUS students often have no address on file — retry the search with this default INSEE.
const DEFAULT_INSEE_CODE = '75113';

const schema = z.object({
  allowanceName: z.nativeEnum(ALLOWANCE),
  caisse: z.nativeEnum(CAISSE).nullable(),
  beneficiaryLastname: z.string().min(1),
  beneficiaryFirstname: z.string().min(1),
  beneficiaryBirthDate: z.string().min(1),
  recipientResidencePlace: z.string().min(1),
  recipientEmail: z.string().email(),
  recipientLastname: z.string().optional(),
  recipientFirstname: z.string().optional(),
  recipientCafNumber: z.string().optional(),
  recipientIneNumber: z.string().optional(),
  recipientBirthDate: z.string().optional(),
  recipientBirthCountry: z.string().optional(),
  recipientBirthPlace: z.string().optional(),
});

type VerdictPayload = z.infer<typeof schema>;

const SITUATION_BY_ALLOWANCE: Record<ALLOWANCE, SituationType | null> = {
  [ALLOWANCE.QF]: LCA_SITUATION.JEUNE,
  [ALLOWANCE.AEEH]: LCA_SITUATION.JEUNE,
  [ALLOWANCE.AAH]: LCA_SITUATION.AAH,
  [ALLOWANCE.CROUS]: LCA_SITUATION.BOURSIER,
  [ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX]: LCA_SITUATION.BOURSIER,
  [ALLOWANCE.NONE]: null,
};

const AIDE_BY_ALLOWANCE: Record<ALLOWANCE, Situation | null> = {
  [ALLOWANCE.QF]: SITUATION.QF,
  [ALLOWANCE.AEEH]: SITUATION.AEEH,
  [ALLOWANCE.AAH]: SITUATION.AAH,
  [ALLOWANCE.CROUS]: SITUATION.CROUS,
  [ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX]: SITUATION.FSS,
  [ALLOWANCE.NONE]: null,
};

const isLcaError = (outcome: unknown): outcome is { message: string } =>
  typeof outcome === 'object' && outcome !== null && 'message' in outcome;

const startTimer = (): (() => number) => {
  const t0 = Date.now();
  return () => Date.now() - t0;
};

// Volume, not privacy: the attestation runs to hundreds of kilobytes per confirm and the
// history rows are never purged. Everything else — id_psp, matricule, courriel — is kept.
const withoutPdf = (
  item: ConfirmResponseBodyItem,
): Omit<ConfirmResponseBodyItem, 'pdf_base_64'> => {
  const { pdf_base_64: _pdf, ...rest } = item;
  return rest;
};

// The organisme the usager declared in step 1. Boursiers never pick one: a bourse is always
// held by the CNOUS.
const declaredOrganisme = (payload: VerdictPayload): OrganismType | null => {
  if (SITUATION_BY_ALLOWANCE[payload.allowanceName] === LCA_SITUATION.BOURSIER) {
    return ORGANISME.CNOUS;
  }

  return payload.caisse === CAISSE.CAF
    ? ORGANISME.CAF
    : payload.caisse === CAISSE.MSA
      ? ORGANISME.MSA
      : null;
};

const matchesDeclaration = (
  item: Pick<SearchResponseBodyItem, 'situation' | 'organisme'>,
  situation: SituationType,
  organisme: OrganismType | null,
): boolean =>
  item.situation.toLowerCase() === situation.toLowerCase() &&
  (organisme === null || item.organisme === organisme);

/**
 * LCA /search then /confirm behind a single request. Splitting them, as the form used to,
 * turned the first step into an oracle: it answered "this person exists in our base" to
 * anyone who typed a name, a birthdate and a commune.
 *
 * Nothing is disclosed at all now. Every outcome answers the same 'sent', and the code, the
 * identity LCA holds and the attestation only ever leave through the email the worker sends.
 * Whoever fills the form learns exactly one thing: that it was processed.
 */
export async function POST(request: Request): Promise<Response> {
  const history: LcaHistoryEvent[] = [];

  try {
    const payload = schema.parse(await request.json());

    const situation = SITUATION_BY_ALLOWANCE[payload.allowanceName];
    const aide = AIDE_BY_ALLOWANCE[payload.allowanceName];
    const organisme = declaredOrganisme(payload);

    if (!situation || !aide) {
      return Response.json({ outcome: 'error' } satisfies VerdictResponseBody, { status: 400 });
    }

    const isBoursier = situation === LCA_SITUATION.BOURSIER;

    const searchPayload = {
      beneficiaryLastname: payload.beneficiaryLastname,
      beneficiaryFirstname: payload.beneficiaryFirstname,
      beneficiaryBirthDate: payload.beneficiaryBirthDate,
      recipientResidencePlace: payload.recipientResidencePlace,
      allowanceName: payload.allowanceName,
      isFromCrous: isBoursier,
    };

    const enqueue = (
      lcaStatus: LcaJobData['lcaStatus'],
      passSportCode: string | null,
      email: string | null,
    ): Promise<unknown> =>
      enqueueLcaJob({
        aide,
        caisse: payload.caisse,
        beneficiary: {
          lastname: payload.beneficiaryLastname,
          firstname: payload.beneficiaryFirstname,
          birthdate: payload.beneficiaryBirthDate,
        },
        allocataire: {
          family_name: payload.recipientLastname,
          given_name: payload.recipientFirstname,
        },
        residenceInsee: payload.recipientResidencePlace,
        lcaStatus,
        passSportCode,
        contactEmail: payload.recipientEmail,
        email,
        history,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      }).catch((e: unknown) => {
        // The usager already has their answer; losing the trace must not cost them the code.
        Sentry.captureException(e, { tags: { component: 'queue', app: 'site' } });
      });

    const recordSearch = (
      action: string,
      durationMs: number,
      body: Record<string, unknown>,
      outcome: Awaited<ReturnType<typeof fetchEligible>>,
      extra?: Record<string, unknown>,
    ): void => {
      const failed = isLcaError(outcome);

      history.push({
        action,
        status: failed ? 'error' : outcome.length === 0 ? 'not_found' : 'success',
        durationMs,
        error: failed ? outcome.message : undefined,
        bodyPayload: body,
        responsePayload: {
          results: failed ? null : outcome,
          result_count: failed ? null : outcome.length,
          ...extra,
        },
      });
    };

    const searchTimer = startTimer();
    let search = await fetchEligible(searchPayload, { keepMatricule: true });
    recordSearch('lca.search', searchTimer(), searchPayload, search, {
      is_from_crous: isBoursier,
    });

    if (isLcaError(search)) {
      await enqueue('error', null, null);
      return Response.json({ outcome: 'error' } satisfies VerdictResponseBody);
    }

    if (search.length === 0 && isBoursier) {
      const retryPayload = { ...searchPayload, recipientResidencePlace: DEFAULT_INSEE_CODE };
      const retryTimer = startTimer();
      const retry = await fetchEligible(retryPayload, { keepMatricule: true });
      recordSearch('lca.search.crous_retry', retryTimer(), retryPayload, retry, {
        insee_fallback: DEFAULT_INSEE_CODE,
      });

      if (isLcaError(retry)) {
        await enqueue('error', null, null);
        return Response.json({ outcome: 'error' } satisfies VerdictResponseBody);
      }

      search = retry;
    }

    const item = search.find((candidate) => matchesDeclaration(candidate, situation, organisme));

    if (!item) {
      history.push({
        action: search.length === 0 ? 'lca.search.not_found' : 'lca.search.declaration_mismatch',
        status: 'not_found',
        durationMs: 0,
        bodyPayload: searchPayload,
        responsePayload: {
          declared: { situation, organisme },
          answered: search.map((c) => ({ situation: c.situation, organisme: c.organisme })),
        },
      });
      await handleSupportCookie(searchPayload, 'search');
      await enqueue('not_found', null, null);
      return Response.json({ outcome: 'sent' } satisfies VerdictResponseBody);
    }

    const confirmPayload = {
      id: item.id.toString(),
      situation: item.situation,
      organisme: item.organisme,
      recipientLastname: payload.recipientLastname,
      recipientFirstname: payload.recipientFirstname,
      recipientCafNumber: payload.recipientCafNumber,
      recipientIneNumber: payload.recipientIneNumber,
      recipientBirthDate: payload.recipientBirthDate,
      recipientBirthCountry: payload.recipientBirthCountry,
      recipientBirthPlace: payload.recipientBirthPlace,
    };

    const recordConfirm = (
      action: string,
      durationMs: number,
      body: Record<string, unknown>,
      outcome: Awaited<ReturnType<typeof fetchCode>>,
      extra?: Record<string, unknown>,
    ): void => {
      const failed = isLcaError(outcome);

      history.push({
        action,
        status: failed ? 'error' : outcome.length === 0 ? 'not_found' : 'success',
        durationMs,
        error: failed ? outcome.message : undefined,
        bodyPayload: body,
        responsePayload: {
          item: failed || outcome.length === 0 ? null : withoutPdf(outcome[0]),
          item_count: failed ? null : outcome.length,
          ...extra,
        },
      });
    };

    const confirmTimer = startTimer();
    let confirm = await fetchCode(confirmPayload);
    recordConfirm('lca.confirm', confirmTimer(), confirmPayload, confirm);

    if (isLcaError(confirm)) {
      await enqueue('error', null, null);
      return Response.json({ outcome: 'error' } satisfies VerdictResponseBody);
    }

    if (confirm.length === 0 && isBoursier && payload.recipientIneNumber) {
      const retryPayload = { ...confirmPayload, recipientBirthPlace: DEFAULT_INSEE_CODE };
      const retryTimer = startTimer();
      const retry = await fetchCode(retryPayload);
      recordConfirm('lca.confirm.boursier_retry', retryTimer(), retryPayload, retry, {
        insee_fallback: DEFAULT_INSEE_CODE,
      });

      if (isLcaError(retry)) {
        await enqueue('error', null, null);
        return Response.json({ outcome: 'error' } satisfies VerdictResponseBody);
      }

      confirm = retry;
    }

    const confirmed = confirm[0];

    if (!confirmed?.id_psp) {
      await handleSupportCookie(confirmPayload, 'confirm');
      await enqueue('not_found', null, null);
      return Response.json({ outcome: 'sent' } satisfies VerdictResponseBody);
    }

    await enqueue('confirmed', confirmed.id_psp, confirmed.allocataire?.courriel ?? null);

    return Response.json({ outcome: 'sent' } satisfies VerdictResponseBody);
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json({ outcome: 'error' } satisfies VerdictResponseBody, { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('component', 'lca');
      scope.setTag('app', 'site');
      scope.captureMessage('Technical error on LCA POST api/eligibility-test/verdict');
      scope.captureException(e);
    });

    return Response.json({ outcome: 'error' } satisfies VerdictResponseBody, { status: 500 });
  }
}
