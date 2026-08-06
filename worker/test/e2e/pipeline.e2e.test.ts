import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// End-to-end pipeline tests against real Redis + Postgres (Testcontainers), a real
// BullMQ Worker, and deterministic fake upstream clients (see harness.ts). Exercises:
// API Particulier chain -> LCA -> email -> one Postgres row per beneficiary, plus where
// the pass Sport code is allowed to land (the table and its view, never the job's return
// value).

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

beforeEach(async () => {
  await stack.pool.query("TRUNCATE eligibility_results");
  // Above the 700 threshold: the QF route grants nothing unless a test lowers it.
  stack.setQfValeur(1000);
  // The stack is shared across the file, so routeOnly() would otherwise leak.
  stack.setChildrenLastname("Enfant");
});

const rows = async () =>
  (await stack.pool.query("select * from eligibility_results order by source, created_at")).rows;

// A CROUS-eligible adult (age 22 at 2026-12-31 reference), matched in LCA.
const selfCrous = (overrides: Record<string, unknown> = {}) => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
  },
  aides: ["CROUS"] as Array<"AAH" | "CROUS" | "AEEH">,
  isFranceConnected: true,
  residenceInsee: "75113",
  ...overrides,
});

describe("worker eligibility pipeline (deterministic fakes)", () => {
  it("self confirmed -> code email, one row", async () => {
    await stack.enqueueAndWait(selfCrous());
    const r = await rows();

    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("self");
    expect(r[0].is_eligible).toBe(true);
    expect(r[0].lca_status).toBe("confirmed");
    expect(r[0].email_kind).toBe("code");
    expect(r[0].email_sent).toBe(true);
    expect(r[0].verdict).toBe("eligible_confirmed");
  });

  it("QF children chain -> enfant rows confirmed with code email", async () => {
    // AEEH pulls QF, whose deterministic children are all sent to LCA.
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const enfants = (await rows()).filter((x) => x.source === "enfant");

    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(enfants.every((x) => x.lca_status === "confirmed")).toBe(true);
    expect(enfants.every((x) => x.email_kind === "code" && x.email_sent === true)).toBe(true);
    expect(enfants.every((x) => x.verdict === "eligible_confirmed")).toBe(true);
  });

  // Nothing was claimed for the adult (AEEH is about the children), so no LCA call is
  // made for them — but the row is still written, marked as not evaluated. The site
  // filters 'not_assessed' out of the recap rather than telling them "pas éligible" to
  // a question they never asked.
  it("aide enfants seule: l'adulte a une ligne 'not_assessed', sans appel LCA", async () => {
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const self = (await rows()).filter((x) => x.source === "self");

    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("not_assessed");
    expect(self[0].lca_status).toBe("not_applicable");
    expect(self[0].is_eligible).toBe(false);
    // No email either: we do not write to someone about an aide they never claimed.
    expect(self[0].email_kind).toBeNull();
  });

  // Regression: this row used to not exist at all. The toProcess filter dropped a self
  // candidate with no route open, so an adult who declared AAH, was refused, and had
  // children left NOTHING in the table — which is exactly the refusal the site has to
  // show them.
  it("AAH refusée avec des enfants: l'adulte a bien une ligne 'not_eligible'", async () => {
    // AAH (the fake answers est_beneficiaire=false) + AEEH to pull QF and its children.
    await stack.enqueueAndWait(selfCrous({ aides: ["AAH", "AEEH"] }));
    const r = await rows();

    const self = r.filter((x) => x.source === "self");
    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("not_eligible");
    expect(self[0].lca_status).toBe("not_applicable");
    expect(self[0].is_eligible).toBe(false);

    // The children are unaffected — they still go through LCA on their own merit.
    expect(r.filter((x) => x.source === "enfant").length).toBeGreaterThan(0);
  });

  // The fake QF returns three children: 2008 (18 ans, AEEH window only), 2009 (17 ans,
  // both windows) and 2012 (14 ans, QF window only). The household quotient defaults to
  // 1000, i.e. above the 700 threshold.
  //
  // The tests below are about OUR routes, so they take LCA out of the picture: a
  // confirmed LCA match sets is_eligible true on its own (index.ts — the base is
  // authoritative), which would make every child look eligible whatever the rule says.
  // A "Nomatch" last name is the harness convention for "LCA finds nobody".
  const routeOnly = () => stack.setChildrenLastname("NomatchEnfant");

  const eligibleBirthdates = async () =>
    (await rows())
      .filter((x) => x.source === "enfant" && x.is_eligible)
      .map((x) => x.enfant_identite?.birthdate)
      .sort();

  it("AEEH seule: seuls les 17-19 ans sont interrogés et peuvent être éligibles", async () => {
    routeOnly();
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }))) as {
      apCalls: number;
    };

    // 1 quotient_familial + 2 AEEH (2008 et 2009). Le cadet de 2012 n'est pas interrogé.
    expect(apCalls).toBe(3);
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01"]);
  });

  it("QF seule au-dessus du seuil: aucun droit ouvert, aucun appel AEEH", async () => {
    routeOnly();
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }))) as {
      apCalls: number;
    };

    // quotient_familial seul: AEEH n'a pas été demandée, donc aucun appel par enfant.
    expect(apCalls).toBe(1);
    // Quotient à 1000, au-dessus du seuil: personne n'est éligible.
    expect(await eligibleBirthdates()).toEqual([]);
  });

  it("QF sous le seuil: les 6-17 ans éligibles sans appel AEEH", async () => {
    routeOnly();
    stack.setQfValeur(699);
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }))) as {
      apCalls: number;
    };

    expect(apCalls).toBe(1);
    // 2009 (17 ans) et 2012 (14 ans) sont dans la fenêtre QF; 2008 (18 ans) non.
    expect(await eligibleBirthdates()).toEqual(["2009-01-01", "2012-01-01"]);
  });

  it("QF prioritaire sur AEEH pour le millésime 2009 partagé", async () => {
    routeOnly();
    stack.setQfValeur(699);
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["QF", "AEEH"] }))) as {
      apCalls: number;
    };

    // 1 QF + 1 seul AEEH: l'aîné de 2008 est hors fenêtre QF donc toujours interrogé,
    // mais celui de 2009 est déjà couvert par le quotient — appel économisé.
    expect(apCalls).toBe(2);
    // 2009 et 2012 par le quotient, 2008 par son verdict AEEH.
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01", "2012-01-01"]);
  });

  it("QF au seuil exact (700) n'ouvre pas de droit", async () => {
    routeOnly();
    stack.setQfValeur(700);
    await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }));

    // Le seuil est strict: 700 n'est pas < 700.
    expect(await eligibleBirthdates()).toEqual([]);
  });

  it("eligible but not found in LCA -> eligible_soon email", async () => {
    // family_name starting NOMATCH makes the deterministic mock return no LCA match.
    await stack.enqueueAndWait(
      selfCrous({
        identity: {
          family_name: "NomatchDupont",
          given_name: "Alex",
          birthdate: "2004-05-15",
          gender: "male",
          birthplace: "75056",
          birthcountry: "99100",
          email: "alex.dupont@example.test",
        },
      }),
    );
    const r = await rows();

    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("self");
    expect(r[0].is_eligible).toBe(true);
    expect(r[0].lca_status).toBe("not_found");
    expect(r[0].email_kind).toBe("eligible_soon");
    expect(r[0].email_sent).toBe(true);
    expect(r[0].verdict).toBe("eligible_pending");
  });

  it("stores the pass Sport code on a confirmed row, and nowhere else", async () => {
    const ret = await stack.enqueueAndWait(selfCrous());

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].lca_status).toBe("confirmed");
    expect(r[0].pass_sport_code).toBe("PSP-CODE-123");

    // The job return value is a different matter: BullMQ stores it in clear in Redis,
    // behind neither a grant nor a session, so the code stays out of it.
    expect(JSON.stringify(ret)).not.toContain("PSP-CODE-123");
  });

  it("leaves pass_sport_code null when LCA returned no code", async () => {
    // 'not_found' — eligible on our routes, absent from the LCA base.
    await stack.enqueueAndWait(
      selfCrous({
        identity: { ...selfCrous().identity, family_name: "NomatchDupont" },
      }),
    );
    const notFound = await rows();
    expect(notFound[0].lca_status).toBe("not_found");
    expect(notFound[0].pass_sport_code).toBeNull();

    await stack.pool.query("TRUNCATE eligibility_results");

    // 'not_applicable' — AAH refused, no LCA call made at all.
    await stack.enqueueAndWait(selfCrous({ aides: ["AAH"] }));
    const notApplicable = await rows();
    expect(notApplicable[0].lca_status).toBe("not_applicable");
    expect(notApplicable[0].pass_sport_code).toBeNull();
  });

  // The view is what the site actually reads — the table being right is not enough.
  it("exposes the code through application_results_by_sub", async () => {
    const sub = "fc-sub-code-view";
    await stack.enqueueAndWait({
      ...selfCrous(),
      identity: { ...selfCrous().identity, sub },
    });

    const view = await stack.pool.query(
      "select * from application_results_by_sub where sub = $1",
      [sub],
    );
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].verdict).toBe("eligible_confirmed");
    expect(view.rows[0].pass_sport_code).toBe("PSP-CODE-123");
  });

  it("persists the allocataire identité pivot, sub excluded", async () => {
    const sub = "fc-sub-identite";
    await stack.enqueueAndWait({
      ...selfCrous(),
      identity: { ...selfCrous().identity, sub },
    });

    const r = await rows();
    expect(r[0].allocataire_identite).toEqual({
      family_name: "Martin",
      given_name: "Camille",
      birthdate: "2004-05-15",
      gender: "female",
      birthplace: "75056",
      birthcountry: "99100",
      email: "camille.martin@example.test",
    });
    // Not duplicated into the jsonb: it has its own indexed column.
    expect(r[0].allocataire_fc_sub).toBe(sub);
    // A 'self' row describes the allocataire, so there is no enfant to store.
    expect(r[0].enfant_identite).toBeNull();
  });

  // The site's dedup falls back to applications_by_sub once the job hash is gone
  // (removeOnComplete), so a completed job that writes no row would let this person
  // resubmit on every visit and re-burn the API Particulier quota.
  it("records an application even when there is no beneficiary at all", async () => {
    const sub = "fc-sub-nobody";
    // AAH only -> no quotient_familial call, so no children; and the fake answers
    // est_beneficiaire=false, so the allocataire is not eligible either.
    await stack.enqueueAndWait({
      ...selfCrous({ aides: ["AAH"] }),
      identity: { ...selfCrous().identity, sub },
    });

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].lca_status).toBe("not_applicable");
    expect(r[0].is_eligible).toBe(false);
    expect(r[0].email_kind).toBeNull();
    // They asked about themselves via AAH and the answer is no — a real refusal, not an
    // absence of question, so the site does show it.
    expect(r[0].verdict).toBe("not_eligible");
    // The part that makes the dedup fallback work.
    expect(r[0].allocataire_fc_sub).toBe(sub);
  });

  it("audit trail records the IP and user-agent", async () => {
    await stack.enqueueAndWait({ ...selfCrous(), clientIp: "203.0.113.7", userAgent: "Mozilla/5.0 probe" });

    const audit = await stack.pool.query("select * from audit order by created_at desc limit 1");
    expect(audit.rows[0].ip_address).toBe("203.0.113.7");
    expect(audit.rows[0].user_agent).toBe("Mozilla/5.0 probe");
  });

  it("email send failure does not fail the job (persists, email_sent=false)", async () => {
    // Force REAL email mode pointed at a dead port so the fetch throws "fetch failed".
    // Env is read at call time, so this affects the in-process worker for this job.
    const prevMode = process.env.LINK_MOBILITY_MODE;
    const prevUrl = process.env.LINK_MOBILITY_API_URL;
    const prevKey = process.env.LINK_MOBILITY_API_KEY;
    const prevSender = process.env.LINK_MOBILITY_SENDER_EMAIL;
    const prevName = process.env.LINK_MOBILITY_SENDER_NAME;
    process.env.LINK_MOBILITY_MODE = "real";
    process.env.LINK_MOBILITY_API_URL = "http://127.0.0.1:1";
    process.env.LINK_MOBILITY_API_KEY = "k";
    process.env.LINK_MOBILITY_SENDER_EMAIL = "s@example.test";
    process.env.LINK_MOBILITY_SENDER_NAME = "pass Sport";
    try {
      await stack.enqueueAndWait(selfCrous());
    } finally {
      process.env.LINK_MOBILITY_MODE = prevMode;
      process.env.LINK_MOBILITY_API_URL = prevUrl;
      process.env.LINK_MOBILITY_API_KEY = prevKey;
      process.env.LINK_MOBILITY_SENDER_EMAIL = prevSender;
      process.env.LINK_MOBILITY_SENDER_NAME = prevName;
    }

    // Job completed (not failed), row persisted, email marked not-sent.
    expect(await stack.queue.getFailedCount()).toBe(0);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].lca_status).toBe("confirmed");
    expect(r[0].email_kind).toBe("code");
    expect(r[0].email_sent).toBe(false);
  });

  it("one row per beneficiary, no duplicates across repeated jobs", async () => {
    const data = selfCrous({ aides: ["CROUS", "AEEH"] }); // self (CROUS) + 3 children
    for (let i = 0; i < 3; i++) await stack.enqueueAndWait(data);

    const r = await rows();
    // 3 jobs x (1 self + 3 enfants) = 12 rows. Every child is an LCA candidate even
    // when no route makes them eligible — the LCA base is authoritative.
    expect(r).toHaveLength(12);

    // Each job produced exactly one self row and one row per child.
    const byJob = new Map<string, string[]>();
    for (const row of r) {
      const list = byJob.get(row.job_id) ?? [];
      list.push(row.source);
      byJob.set(row.job_id, list);
    }
    expect(byJob.size).toBe(3);
    for (const sources of byJob.values()) {
      expect(sources.sort()).toEqual(["enfant", "enfant", "enfant", "self"]);
    }
  });
});
