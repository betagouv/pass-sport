import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import {
  CAISSE,
  SITUATION,
  type ApiParticulierJobPayload,
} from "../../src/eligibility/types";
import { LCA_SITUATION, ORGANISME } from "../../src/lca/types";

// End-to-end tests for the combined form (no FranceConnect), against real Redis +
// Postgres and a real BullMQ Worker. Pins the ORDER — LCA first, API Particulier only when
// LCA came back empty — and that one declared situation costs one set of calls.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

beforeEach(async () => {
  await stack.pool.query("TRUNCATE eligibility_results");
  await stack.pool.query("TRUNCATE eligibility_history");
  stack.setQfValeur(1000);
  stack.setAahBeneficiaire(false);
  stack.setLcaAnswer(null);
  stack.setLcaSearchHttpStatus(null);
  stack.setChildrenLastname(HOUSEHOLD_LASTNAME);
});

const rows = async () =>
  (await stack.pool.query("select * from eligibility_results order by created_at")).rows;

const historyActions = async (): Promise<string[]> =>
  (await stack.pool.query("select action from eligibility_history order by created_at")).rows.map(
    (r) => r.action as string,
  );

const apCalls = async (): Promise<string[]> =>
  (
    await stack.pool.query(
      "select action from eligibility_history where actor = 'api_particulier' and status <> 'skipped' order by created_at",
    )
  ).rows.map((r) => r.action as string);

const allocataire = {
  family_name: "Martin",
  given_name: "Claude",
  birthdate: "1980-03-02",
  gender: "female" as const,
  birthplace: "75056",
  birthcountry: "99100",
  email: "claude.martin@example.test",
};

// Unknown to the fake LCA, which answers nothing for a "Nomatch…" name, but known to the
// fake quotient familial: the combination that exercises the fallback.
const HOUSEHOLD_LASTNAME = "NomatchEnfant";

// The child the fake quotient_familial returns as "Cadet": born 2012, 14 ans at the
// 2026-12-31 reference date, inside the 6-17 window.
const qfRequest = (overrides: Partial<ApiParticulierJobPayload> = {}): ApiParticulierJobPayload => ({
  aide: SITUATION.QF,
  caisse: CAISSE.CAF,
  beneficiary: { lastname: HOUSEHOLD_LASTNAME, firstname: "Cadet", birthdate: "2012-01-01" },
  allocataire,
  birthCountryIso: "FR",
  cafNumber: "1234567",
  residenceInsee: "75113",
  email: "claude.martin@example.test",
  ...overrides,
});

describe("combined form job (no FranceConnect)", () => {
  it("LCA confirms -> code stored, API Particulier never called", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.JEUNE, organisme: ORGANISME.CAF });

    // The only test whose beneficiary is NOT a "Nomatch…" name, so the fake LCA answers.
    const result = (await stack.enqueueApAndWait(
      qfRequest({
        beneficiary: { lastname: "Enfant", firstname: "Cadet", birthdate: "2012-01-01" },
      }),
    )) as { apCalls: number };

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].verdict).toBe("eligible_confirmed");
    expect(r[0].lca_status).toBe("confirmed");
    expect(r[0].pass_sport_code).toBe("PSP-CODE-123");
    expect(r[0].is_france_connected).toBe(false);
    expect(r[0].allocataire_fc_sub).toBeNull();
    expect(r[0].source).toBe("enfant");
    expect(r[0].email_sent).toBe(true);

    expect(result.apCalls).toBe(0);
    expect(await apCalls()).toEqual([]);
  });

  // LCA matched the person on /search but handed back no code. That is not an incident:
  // the job carries on to API Particulier exactly as if LCA had found nobody.
  it("empty confirm -> the job falls through to API Particulier instead of failing", async () => {
    stack.setQfValeur(650);
    stack.setChildrenLastname("Enfant");
    stack.setLcaAnswer({ situation: LCA_SITUATION.JEUNE, organisme: ORGANISME.CAF });
    stack.setLcaConfirmEmpty(true);

    try {
      const result = (await stack.enqueueApAndWait(
        qfRequest({
          beneficiary: { lastname: "Enfant", firstname: "Cadet", birthdate: "2012-01-01" },
        }),
      )) as { apCalls: number };

      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0].lca_status).toBe("not_found");
      expect(r[0].verdict).toBe("eligible_pending");
      expect(r[0].pass_sport_code).toBeNull();
      expect(result.apCalls).toBe(1);
    } finally {
      stack.setLcaConfirmEmpty(false);
    }
  });

  it("LCA has nobody + quotient under the threshold -> eligible_pending on one QF call", async () => {
    stack.setQfValeur(650);

    const result = (await stack.enqueueApAndWait(qfRequest())) as { apCalls: number };

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].verdict).toBe("eligible_pending");
    expect(r[0].lca_status).toBe("not_found");
    expect(r[0].pass_sport_code).toBeNull();
    expect(r[0].email_kind).toBe("eligible_soon");

    expect(result.apCalls).toBe(1);
    expect(await apCalls()).toEqual(["dss.quotient_familial_identite"]);
  });

  it("quotient above the threshold -> not_eligible", async () => {
    stack.setQfValeur(1000);

    await stack.enqueueApAndWait(qfRequest());

    const r = await rows();
    expect(r[0].verdict).toBe("not_eligible");
    expect(r[0].email_kind).toBe("not_eligible");
    expect(r[0].is_eligible).toBe(false);
  });

  it("a child the household does not contain is not eligible, whatever the quotient", async () => {
    stack.setQfValeur(650);

    await stack.enqueueApAndWait(
      qfRequest({
        beneficiary: {
          lastname: HOUSEHOLD_LASTNAME,
          firstname: "Inconnu",
          birthdate: "2012-01-01",
        },
      }),
    );

    const r = await rows();
    expect(r[0].verdict).toBe("not_eligible");
    expect(await historyActions()).toContain("enfant.match");
  });

  it("matches the child through accents, case and hyphens", async () => {
    stack.setQfValeur(650);

    await stack.enqueueApAndWait(
      qfRequest({
        beneficiary: { lastname: "nomatchÉnfànt", firstname: "CADET", birthdate: "2012-01-01" },
      }),
    );

    const r = await rows();
    expect(r[0].verdict).toBe("eligible_pending");
  });

  it("AEEH costs exactly two calls: quotient familial then AEEH for that child", async () => {
    // "Aine" is born 2008 -> 18 ans, inside the 17-19 AEEH window.
    const result = (await stack.enqueueApAndWait(
      qfRequest({
          aide: SITUATION.AEEH,
          beneficiary: { lastname: HOUSEHOLD_LASTNAME, firstname: "Aine", birthdate: "2008-01-01" },
        }),
    )) as { apCalls: number };

    const r = await rows();
    expect(r[0].verdict).toBe("eligible_pending");

    expect(result.apCalls).toBe(2);
    expect(await apCalls()).toEqual([
      "dss.quotient_familial_identite",
      "dss.allocation_enfant_handicape_identite",
    ]);
  });

  it("AEEH outside the 17-19 window stops after the quotient familial call", async () => {
    const result = (await stack.enqueueApAndWait(
      qfRequest({
          aide: SITUATION.AEEH,
          // Cadet is 14 ans: nothing AEEH could grant, so the per-child call is pure quota.
          beneficiary: { lastname: HOUSEHOLD_LASTNAME, firstname: "Cadet", birthdate: "2012-01-01" },
        }),
    )) as { apCalls: number };

    expect(result.apCalls).toBe(1);
    expect(await apCalls()).toEqual(["dss.quotient_familial_identite"]);
    expect((await rows())[0].verdict).toBe("not_eligible");
  });

  it("AAH costs one call and lands on the allocataire row", async () => {
    stack.setAahBeneficiaire(true);
    stack.setLcaAnswer({ situation: LCA_SITUATION.AAH, organisme: ORGANISME.CAF });

    const result = (await stack.enqueueApAndWait(
      qfRequest({
          aide: SITUATION.AAH,
          // 20 ans at the reference date: inside the 16-30 AAH window.
          beneficiary: { lastname: "NomatchMartin", firstname: "Camille", birthdate: "2006-04-01" },
        }),
    )) as { apCalls: number };

    const r = await rows();
    expect(r[0].verdict).toBe("eligible_pending");
    expect(r[0].source).toBe("self");
    expect(r[0].enfant_identite).toBeNull();

    expect(result.apCalls).toBe(1);
    expect(await apCalls()).toEqual(["dss.allocation_adulte_handicape_identite"]);
  });

  it("a boursier with an INE goes through the INE route, not the identité one", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.BOURSIER, organisme: ORGANISME.CNOUS });

    const result = (await stack.enqueueApAndWait(
      qfRequest({
          aide: SITUATION.CROUS,
          caisse: null,
          cafNumber: undefined,
          ine: "0123456789X",
          // 22 ans at the reference date: under the 28 CROUS ceiling.
          beneficiary: { lastname: "NomatchMartin", firstname: "Camille", birthdate: "2004-05-15" },
        }),
    )) as { apCalls: number };

    const r = await rows();
    expect(r[0].verdict).toBe("eligible_pending");
    expect(r[0].source).toBe("self");

    expect(result.apCalls).toBe(1);
    expect(await apCalls()).toEqual(["cnous.etudiant_boursier_ine"]);
  });

  it("a boursier without an INE falls back to the identité route", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.BOURSIER, organisme: ORGANISME.CNOUS });

    await stack.enqueueApAndWait(
      qfRequest({
        aide: SITUATION.CROUS,
        caisse: null,
        cafNumber: undefined,
        beneficiary: { lastname: "NomatchMartin", firstname: "Camille", birthdate: "2004-05-15" },
      }),
    );

    expect(await apCalls()).toEqual(["cnous.etudiant_boursier_identite"]);
  });

  it("formations sanitaires et sociales has no API Particulier route", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.BOURSIER, organisme: ORGANISME.CNOUS });

    const result = (await stack.enqueueApAndWait(
      qfRequest({
          aide: SITUATION.FSS,
          caisse: null,
          cafNumber: undefined,
          beneficiary: { lastname: "NomatchMartin", firstname: "Camille", birthdate: "2004-05-15" },
        }),
    )) as { apCalls: number };

    expect(result.apCalls).toBe(0);
    expect(await apCalls()).toEqual([]);
    expect((await rows())[0].verdict).toBe("not_eligible");
  });

  it("a situation LCA disagrees with is treated as no match and recorded", async () => {
    stack.setQfValeur(650);
    // LCA has to FIND this person for a mismatch to be possible at all, so both it and the
    // fake household answer on the same plain name.
    stack.setChildrenLastname("Enfant");
    // The usager declared CAF; LCA answers that this person is with the MSA.
    stack.setLcaAnswer({ situation: LCA_SITUATION.JEUNE, organisme: ORGANISME.MSA });

    await stack.enqueueApAndWait(
      qfRequest({
        beneficiary: { lastname: "Enfant", firstname: "Cadet", birthdate: "2012-01-01" },
      }),
    );

    expect(await historyActions()).toContain("lca.search.declaration_mismatch");
    // The mismatch must not cost the usager their verdict — API Particulier still answers.
    expect((await rows())[0].verdict).toBe("eligible_pending");
  });

  it("an LCA 5xx fails the job and persists nothing", async () => {
    stack.setLcaSearchHttpStatus(503);

    const reason = await stack.enqueueApAndWaitFailure(qfRequest());

    expect(reason).toContain("LCA /search unavailable");
    expect(await rows()).toHaveLength(0);
  });

  it("an LCA 4xx is not a failure: the job carries on to API Particulier", async () => {
    stack.setQfValeur(650);
    stack.setLcaSearchHttpStatus(404);

    await stack.enqueueApAndWait(qfRequest());

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].lca_status).toBe("error");
    expect(r[0].verdict).toBe("eligible_pending");
  });

  it("sends the allocataire birthdate to LCA in the French order", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.JEUNE, organisme: ORGANISME.MSA });

    // A name LCA answers on, otherwise there is no /confirm call to inspect.
    await stack.enqueueApAndWait(
      qfRequest({
        caisse: CAISSE.MSA,
        cafNumber: undefined,
        beneficiary: { lastname: "Enfant", firstname: "Cadet", birthdate: "2012-01-01" },
      }),
    );

    const [payload] = stack.lcaConfirmPayloads().slice(-1);
    expect(payload.recipientBirthDate).toBe("02/03/1980");
    // Born in France, so LCA gets the commune and not the country.
    expect(payload.recipientBirthPlace).toBe("75056");
    expect(payload.recipientBirthCountry).toBeUndefined();
  });

  // The address is masked by the view, not by the site, so that site_readonly never holds
  // the real one. If someone ever widens the projection, this fails.
  it("exposes only a masked address, never the one the usager typed", async () => {
    const email = "patrick.nguyen.ext@beta.gouv.fr";

    await stack.enqueueApAndWait(qfRequest({ email }));

    // Stored raw, otherwise the assertions below would pass vacuously.
    const stored = await stack.pool.query("select email from eligibility_results");
    expect(stored.rows[0].email).toBe(email);

    const view = await stack.pool.query("select email_mask from application_results_by_job_id");
    expect(view.rows[0].email_mask).toBe("p***t@beta.gouv.fr");

    // Column-layout independent: the address appears nowhere in what the view hands out,
    // and neither does the local part on its own.
    const blobs = await stack.pool.query(
      "select row_to_json(t)::text as blob from application_results_by_job_id t",
    );
    expect(blobs.rows.some((b) => b.blob.includes(email))).toBe(false);
    expect(blobs.rows.some((b) => b.blob.includes("patrick.nguyen.ext"))).toBe(false);
  });

  it("the same request twice is one job", async () => {
    stack.setLcaAnswer({ situation: LCA_SITUATION.JEUNE, organisme: ORGANISME.CAF });

    await stack.enqueueApAndWait(qfRequest(), "same-identity-hash");
    const again = await stack.apQueue.add("api-particulier-job", qfRequest(), {
      jobId: "same-identity-hash",
    });

    // BullMQ ignores an add() for an id it already holds, so the second call resolves to
    // the first job rather than queueing a second round of API Particulier calls.
    expect(again.id).toBe("same-identity-hash");
    expect(await rows()).toHaveLength(1);
  });
});
