import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import {
  COG_RELANCE_ALLOWLIST_ACTION,
  enqueueCogRelance,
  selectCogRelanceTargets,
} from "../../src/scripts/cog-relance";

let stack: Stack;

// Born in Corsica before 1976: FranceConnect serves the 20xxx code, API Particulier refuses it.
const identityFor = (sub: string, birthplace = "20033") => ({
  family_name: "KORVANESE",
  given_name: "Dramoleth",
  birthdate: "1972-06-18",
  gender: "female" as const,
  birthplace,
  birthcountry: "99100",
  email: "dramoleth.korvanese@example.test",
  sub,
});

const rowsFor = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from eligibility_results where allocataire_fc_sub = $1 order by source, (enfant_identite->>'given_name')",
      [sub],
    )
  ).rows;

const byName = (rows: Record<string, any>[], name: string) =>
  rows.find((r) => r.enfant_identite?.given_name === name);

// enqueueCogRelance uses the production options: the job is removed once completed.
const waitForRelance = async (sub: string): Promise<void> => {
  for (let i = 0; i < 300; i++) {
    const job = await stack.queue.getJob(sub);
    const state = await job?.getState();

    if (!job || state === "completed") return;
    if (state === "failed") throw new Error(`relance ${sub} failed: ${job.failedReason}`);

    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`relance ${sub} did not finish in time`);
};

beforeAll(async () => {
  stack = await startStack();
  stack.setAahBeneficiaire(false);
  stack.setAeehBeneficiaire(false);
  stack.setCrousBoursier(false);
  stack.setQfValeur(500);
  process.env.FC_RELANCE_COOLDOWN_DAYS = "0";
  process.env.FC_RELANCE_ALLOWLIST_ONLY = "yes";
}, 180_000);

afterAll(async () => {
  delete process.env.FC_RELANCE_COOLDOWN_DAYS;
  delete process.env.FC_RELANCE_ALLOWLIST_ONLY;
  stack?.setQfRefusedBirthplaces([]);
  await stack?.close();
});

describe("demande d'un usager né en Corse avant 1976", () => {
  const sub = "fc-sub-cog-corse-demande";

  beforeAll(async () => {
    stack.setQfRefusedBirthplaces(["20033"]);
    await stack.enqueueAndWait({ identity: identityFor(sub), isFranceConnected: true }, sub);
  }, 120_000);

  it("interroge le QF sur le code actuel et retrouve les enfants", async () => {
    const rows = await rowsFor(sub);

    // The four children, no row of the allocataire's own: no route of theirs opens.
    expect(rows).toHaveLength(4);
    expect(byName(rows, "Cadet")).toMatchObject({ verdict: "eligible_pending", situation: "QF" });
  });

  it("garde le code servi par FranceConnect dans l'identité de l'allocataire", async () => {
    const rows = await rowsFor(sub);
    expect(rows.every((r) => r.allocataire_identite.birthplace === "20033")).toBe(true);
  });

  it("trace la règle appliquée sur l'appel QF", async () => {
    const { rows } = await stack.pool.query(
      "select body_payload, response_payload from eligibility_history where allocataire_fc_sub = $1 and action = 'dss.quotient_familial_identite' and status = 'success'",
      [sub],
    );

    expect(rows[0].body_payload.code_cog_insee_commune_naissance).toBe("2B033");
    expect(rows[0].response_payload.birthplace_fallback).toEqual({
      rule: "corse_1976",
      code_fc: "20033",
      code_envoye: "2B033",
    });
  });

  it("n'est pas ciblé par la relance groupée", async () => {
    const targets = await selectCogRelanceTargets(stack.pool);
    expect(targets.map((t) => t.sub)).not.toContain(sub);
  });
});

describe("relance groupée d'un usager refusé avant le correctif", () => {
  const sub = "fc-sub-cog-corse-relance";

  beforeAll(async () => {
    // Before the fix: whichever Corsican code went out, QF answered 422.
    stack.setQfRefusedBirthplaces(["20033", "2B033"]);
    await stack.enqueueAndWait({ identity: identityFor(sub), isFranceConnected: true }, sub);
    stack.setQfRefusedBirthplaces(["20033"]);
  }, 120_000);

  it("part d'un refus sans enfant", async () => {
    const rows = await rowsFor(sub);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "self", verdict: "not_eligible", relance_allowed: false });
  });

  it("est ciblé, avec l'identité de son dernier run", async () => {
    const targets = await selectCogRelanceTargets(stack.pool);
    const target = targets.find((t) => t.sub === sub);

    expect(target?.identity).toMatchObject({ family_name: "KORVANESE", birthplace: "20033" });
  });

  it("ouvre la relance, la met en file et récupère les enfants", async () => {
    const targets = (await selectCogRelanceTargets(stack.pool)).filter((t) => t.sub === sub);

    const { enqueued } = await enqueueCogRelance(stack.pool, stack.queue, targets);
    expect(enqueued).toEqual([sub]);
    await waitForRelance(sub);

    const rows = await rowsFor(sub);
    expect(rows).toHaveLength(5);
    expect(byName(rows, "Cadet")).toMatchObject({ verdict: "eligible_pending", situation: "QF" });
    expect(byName(rows, "Milieu")).toMatchObject({ verdict: "eligible_pending", situation: "QF" });
  });

  it("trace l'ouverture de relance_allowed", async () => {
    const { rows } = await stack.pool.query(
      "select response_payload from eligibility_history where allocataire_fc_sub = $1 and action = $2",
      [sub, COG_RELANCE_ALLOWLIST_ACTION],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].response_payload.eligibility_result_ids).toHaveLength(1);
  });

  it("n'est plus ciblé ensuite", async () => {
    const targets = await selectCogRelanceTargets(stack.pool);
    expect(targets.map((t) => t.sub)).not.toContain(sub);
  });
});

describe("usager né sur un code ordinaire", () => {
  const sub = "fc-sub-cog-ordinaire";

  it("n'est jamais ciblé", async () => {
    stack.setQfNotFound(true);
    await stack.enqueueAndWait(
      { identity: identityFor(sub, "61157"), isFranceConnected: true },
      sub,
    );
    stack.setQfNotFound(false);

    const targets = await selectCogRelanceTargets(stack.pool);
    expect(targets.map((t) => t.sub)).not.toContain(sub);
  });
});
