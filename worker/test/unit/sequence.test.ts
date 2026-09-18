import { describe, expect, it, vi } from "vitest";
import type { Job, Queue } from "bullmq";
import { runEligibilitySequence } from "../../src/eligibility/sequence";
import type { ApiParticulierClient } from "../../src/eligibility/client";
import type { HistoryRecorder } from "../../src/db/history";
import type { ApiParticulierRateGate, RateSlot } from "../../src/eligibility/rate-gate";
import type {
  EligibilityJobData,
  PersonneQuotientFamilial,
  PivotIdentity,
  QuotientFamilialData,
  ResourceResult,
} from "../../src/eligibility/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const JEUNE_RATTACHE: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "2002-05-10",
};

const PARENT: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Handrivel",
  birthdate: "1971-07-12",
};

const PARENT_NE_A_PARIS: PivotIdentity = {
  ...PARENT,
  birthplace: "75056",
  birthcountry: "99100",
};

const PARENTS: PersonneQuotientFamilial[] = [
  { nom_naissance: "OSTRENYA", prenoms: "Handrivel", date_naissance: "12/07/1971", sexe: "F" },
  { nom_naissance: "VOKTARIMENDO", prenoms: "Tarnu", date_naissance: "17/11/1969", sexe: "M" },
];

// The connected user first, then the 12 ans sibling the household quotient covers.
const FRATRIE: PersonneQuotientFamilial[] = [
  { nom_naissance: "OSTRENYA", prenoms: "Velmorak", date_naissance: "10/05/2002", sexe: "F" },
  { nom_naissance: "OSTRENYA", prenoms: "Quorindel", date_naissance: "03/09/2014", sexe: "M" },
];

// An 18 ans: inside the AEEH window (6-19) and outside the QF one (6-17), so the household
// quotient does not spare his per-child call. Without him the AEEH assertions would pass on the
// QF priority rule alone rather than on the guard under test.
const AINE: PersonneQuotientFamilial = {
  nom_naissance: "OSTRENYA",
  prenoms: "Zephrandil",
  date_naissance: "21/04/2008",
  sexe: "M",
};

const ok = (resource: string, data: ResourceResult["data"]): ResourceResult => ({
  resource,
  label: resource,
  httpStatus: 200,
  success: true,
  data,
});

const rejected = (resource: string): ResourceResult => ({
  resource,
  label: resource,
  httpStatus: 422,
  success: false,
  data: null,
  error: "Le paramètre codeCogInseeCommuneNaissance est invalide",
  errorCode: "40001",
});

const qfData = (enfants: PersonneQuotientFamilial[]): QuotientFamilialData => ({
  allocataires: PARENTS,
  enfants,
  quotient_familial: { valeur: 500 },
});

const stubClient = (enfants: PersonneQuotientFamilial[]) => ({
  quotientFamilial: vi.fn(async () =>
    ok("dss.quotient_familial_identite", qfData(enfants)),
  ),
  aah: vi.fn(async () =>
    ok("dss.allocation_adulte_handicape_identite", { est_beneficiaire: false }),
  ),
  cnous: vi.fn(async () =>
    ok("cnous.etudiant_boursier_identite", { statut_boursier: { est_boursier: false } }),
  ),
  cnousByIne: vi.fn(),
  aeeh: vi.fn(async (_child: PivotIdentity, _childIndex: number) =>
    ok("dss.allocation_enfant_handicape_identite", { status: "non_allocataire" }),
  ),
});

// Stands in for BullMQ: the sequence only ever reads `id` and writes the checkpoint back.
const stubJob = () => {
  const job = {
    id: "job-1",
    data: {} as EligibilityJobData,
    updateData: vi.fn(async (next: EligibilityJobData) => {
      job.data = next;
    }),
  };

  return job as unknown as Job<EligibilityJobData>;
};

const openGate = (): ApiParticulierRateGate => ({
  take: vi.fn(
    async (): Promise<RateSlot> => ({ allowed: true, perSecond: 20, perMinute: 300, isNight: false }),
  ),
});

// August 2026: the first campaign month, so the quotient sweep is a single call and the counts
// below are about the child routes alone.
const AOUT_2026 = new Date("2026-08-15T10:00:00Z");

const run = async (identity: PivotIdentity, client: ApiParticulierClient) => {
  const history: HistoryRecorder = { record: vi.fn(async () => {}) };
  const queue = { rateLimit: async () => {} } as unknown as Queue<EligibilityJobData>;

  return runEligibilitySequence(
    stubJob(),
    { identity, isFranceConnected: true },
    client,
    queue,
    history,
    openGate(),
    AOUT_2026,
  );
};

describe("runEligibilitySequence — pivot rattaché au foyer de ses parents", () => {
  // AEEH is a handicap question. Asking it about the children of a foyer the connected user is
  // not allocataire of is worse than the wasted quota.
  it("asks nothing about the children when the pivot is himself an enfant of the foyer", async () => {
    const client = stubClient([...FRATRIE, AINE]);

    await run(JEUNE_RATTACHE, client);

    expect(client.aeeh).not.toHaveBeenCalled();
  });

  it("still asks about the pivot himself", async () => {
    const client = stubClient([...FRATRIE, AINE]);

    await run(JEUNE_RATTACHE, client);

    expect(client.quotientFamilial).toHaveBeenCalledTimes(1);
    expect(client.aah).toHaveBeenCalledTimes(1);
    expect(client.cnous).toHaveBeenCalledTimes(1);
  });

  it("keeps asking about the children of an allocataire", async () => {
    const client = stubClient([...FRATRIE, AINE]);

    await run(PARENT, client);

    expect(client.aeeh).toHaveBeenCalledTimes(1);
  });
});

describe("runEligibilitySequence — AEEH et le lieu de naissance", () => {
  const AEEH = "dss.allocation_enfant_handicape_identite";

  // The index of AINE in [...FRATRIE, AINE]: the household quotient covers the two others.
  const AINE_INDEX = 2;

  const aeehCalls = (client: ReturnType<typeof stubClient>) => client.aeeh.mock.calls;

  it("never sends the commune de naissance, which is the parent's alone", async () => {
    const client = stubClient([...FRATRIE, AINE]);

    await run(PARENT_NE_A_PARIS, client);

    expect(aeehCalls(client)[0][0].birthplace).toBeUndefined();
  });

  it("asks on France first, whatever the pays de naissance of the parent", async () => {
    const client = stubClient([...FRATRIE, AINE]);

    await run({ ...PARENT_NE_A_PARIS, birthcountry: "99135" }, client);

    expect(aeehCalls(client)[0][0]).toMatchObject({ birthcountry: "99100" });
  });

  it("asks again on the pays de naissance of the parent when France was rejected", async () => {
    const client = stubClient([...FRATRIE, AINE]);
    client.aeeh
      .mockResolvedValueOnce(rejected(AEEH))
      .mockResolvedValueOnce(ok(AEEH, { status: "allocataire" }));

    const results = await run({ ...PARENT_NE_A_PARIS, birthcountry: "99135" }, client);

    expect(client.aeeh).toHaveBeenCalledTimes(2);
    expect(aeehCalls(client)[1]).toEqual([
      expect.objectContaining({ birthcountry: "99135" }),
      AINE_INDEX,
    ]);
    expect(aeehCalls(client)[1][0].birthplace).toBeUndefined();
    expect(results.filter((r) => r.resource === AEEH)).toHaveLength(2);
  });

  it("asks nothing more when the parent was born in France too", async () => {
    const client = stubClient([...FRATRIE, AINE]);
    client.aeeh.mockResolvedValue(rejected(AEEH));

    await run(PARENT_NE_A_PARIS, client);

    expect(client.aeeh).toHaveBeenCalledTimes(1);
  });

  it("asks nothing more when FranceConnect served no pays de naissance", async () => {
    const client = stubClient([...FRATRIE, AINE]);
    client.aeeh.mockResolvedValue(rejected(AEEH));

    await run(PARENT, client);

    expect(client.aeeh).toHaveBeenCalledTimes(1);
  });

  it("never asks a third time", async () => {
    const client = stubClient([...FRATRIE, AINE]);
    client.aeeh.mockResolvedValue(rejected(AEEH));

    await run({ ...PARENT_NE_A_PARIS, birthcountry: "99135" }, client);

    expect(client.aeeh).toHaveBeenCalledTimes(2);
  });
});
