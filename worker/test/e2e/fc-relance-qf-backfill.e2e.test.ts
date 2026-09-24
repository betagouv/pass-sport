import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

let stack: Stack;

const identityFor = (sub: string) => ({
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "2004-05-15", // 22 ans : fenêtres AAH et CROUS
  gender: "female" as const,
  birthplace: "75056",
  birthcountry: "99100",
  email: "velmorak.ostrenya@example.test",
  sub,
});

const inputFor = (sub: string) => ({ identity: identityFor(sub), isFranceConnected: true });

const rowsFor = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from eligibility_results where allocataire_fc_sub = $1 order by source, (enfant_identite->>'given_name')",
      [sub],
    )
  ).rows;

const relanceEventsFor = async (sub: string) =>
  (
    await stack.pool.query(
      "select status, subject, response_payload from eligibility_history where allocataire_fc_sub = $1 and action = 'fc_relance' order by created_at, id",
      [sub],
    )
  ).rows;

const byName = (rows: Record<string, any>[], name: string) =>
  rows.find((r) => r.enfant_identite?.given_name === name);

beforeAll(async () => {
  stack = await startStack();
  stack.setAahBeneficiaire(false);
  stack.setAeehBeneficiaire(false);
  process.env.FC_RELANCE_COOLDOWN_DAYS = "0";
}, 180_000);

afterAll(async () => {
  delete process.env.FC_RELANCE_COOLDOWN_DAYS;
  await stack?.close();
});

describe("allocataire éligible dont le QF a échoué", () => {
  const sub = "fc-sub-qf-ko-eligible";
  let initialRows: Record<string, any>[];

  beforeAll(async () => {
    stack.setCrousBoursier(true);
    stack.setQfOutage(true);
    await stack.enqueueAndWait(inputFor(sub), sub);
    initialRows = await rowsFor(sub);

    stack.setQfOutage(false);
    stack.setQfValeur(500);
    await stack.enqueueRelanceAndWait(inputFor(sub), sub);
  }, 120_000);

  afterAll(() => {
    stack.setQfValeur(1000);
  });

  it("pose un verdict sans le QF au lieu d'échouer", async () => {
    expect(initialRows).toHaveLength(1);
    expect(initialRows[0]).toMatchObject({ source: "self", verdict: "eligible_pending" });

    const { rows } = await stack.pool.query(
      "select response_payload from eligibility_history where allocataire_fc_sub = $1 and action = 'results.persisted'",
      [sub],
    );
    expect(rows[0].response_payload.rejected_resources).toContainEqual(
      expect.objectContaining({
        resource: "dss.quotient_familial_identite",
        reason: "provider_error",
        http_status: 503,
      }),
    );
  });

  it("insère les enfants dans le run de l'allocataire", async () => {
    const rows = await rowsFor(sub);
    const self = rows.find((r) => r.source === "self");

    expect(rows).toHaveLength(5);
    const { rows: lastRun } = await stack.pool.query(
      "select 1 from application_results_by_sub where sub = $1",
      [sub],
    );
    expect(lastRun).toHaveLength(5);
    expect(rows.every((r) => r.job_id === self.job_id && r.email === self.email)).toBe(true);

    expect(byName(rows, "Milieu")).toMatchObject({ verdict: "eligible_pending", situation: "QF" });
    expect(byName(rows, "Cadet")).toMatchObject({ verdict: "eligible_pending", situation: "QF" });
    expect(byName(rows, "Aine")?.verdict).toBe("not_eligible");
    expect(byName(rows, "Adulte")?.verdict).toBe("not_eligible");
  });

  it("laisse le verdict de l'allocataire éligible en place", async () => {
    const self = (await rowsFor(sub)).find((r) => r.source === "self");

    expect(self).toMatchObject({ id: initialRows[0].id, verdict: "eligible_pending" });
    expect(self.caisse).toBe(initialRows[0].caisse);
  });

  it("trace chaque enfant inséré", async () => {
    const inserted = (await relanceEventsFor(sub)).filter(
      (e) => e.response_payload.raison === "enfant_recupere_apres_echec_qf",
    );

    expect(inserted).toHaveLength(4);
    expect(inserted.every((e) => e.subject === "enfant" && e.response_payload.inserted)).toBe(
      true,
    );
  });

  it("n'insère rien de plus à la relance suivante", async () => {
    await stack.enqueueRelanceAndWait(inputFor(sub), sub);

    expect(await rowsFor(sub)).toHaveLength(5);
  });
});

describe("allocataire refusé dont le QF a échoué", () => {
  const sub = "fc-sub-qf-ko-refuse";

  beforeAll(async () => {
    stack.setCrousBoursier(false);
    stack.setQfOutage(true);
    await stack.enqueueAndWait(inputFor(sub), sub);
  }, 120_000);

  afterAll(() => {
    stack.setQfOutage(false);
    stack.setQfValeur(1000);
  });

  it("n'insère rien tant que le QF reste en échec", async () => {
    await stack.enqueueRelanceAndWait(inputFor(sub), sub);

    const rows = await rowsFor(sub);
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict).toBe("not_eligible");
  });

  it("récupère les enfants et relève l'allocataire quand le QF répond", async () => {
    stack.setQfOutage(false);
    stack.setQfValeur(500);
    stack.setCrousBoursier(true);

    await stack.enqueueRelanceAndWait(inputFor(sub), sub);

    const rows = await rowsFor(sub);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.source === "self")).toMatchObject({
      verdict: "eligible_pending",
      situation: "boursier",
    });
    expect(byName(rows, "Cadet")?.verdict).toBe("eligible_pending");
  });
});

describe("allocataire seul dont le QF a répondu", () => {
  const sub = "fc-sub-qf-ok-sans-enfant";

  it("n'est pas ciblé une fois éligible", async () => {
    stack.setCrousBoursier(true);
    stack.setQfChildless(true);
    await stack.enqueueAndWait(inputFor(sub), sub);
    stack.setQfChildless(false);

    const before = stack.apiCallCount();
    await stack.enqueueRelanceAndWait(inputFor(sub), sub);

    expect(stack.apiCallCount()).toBe(before);
    expect(await rowsFor(sub)).toHaveLength(1);

    const events = await relanceEventsFor(sub);
    expect(events).toHaveLength(1);
    expect(events[0].response_payload.raison).toBe("aucune_cible");
  });
});
