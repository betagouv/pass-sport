import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";

// End-to-end pipeline tests against real Redis + Postgres (Testcontainers), a real
// BullMQ Worker, and a deterministic fake API Particulier (see harness.ts). Exercises:
// accusé de réception -> API Particulier chain -> one Postgres row per beneficiary. No LCA
// call and no outcome mail: this path hands out no code, it records who is eligible so the
// data/ pipeline can mint one later.

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
  stack.setChildrenLastname("Enfant");
});

const rows = async () =>
  (await stack.pool.query("select * from eligibility_results order by source, created_at")).rows;

// A CROUS-eligible adult (age 22 at the 2026-12-31 reference date).
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
  ...overrides,
});

describe("worker eligibility pipeline (deterministic fakes)", () => {
  it("route ouverte -> une ligne 'eligible_pending', sans code ni mail de résultat", async () => {
    const before = stack.sentEmails().length;
    await stack.enqueueAndWait(selfCrous());
    const r = await rows();

    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("self");
    expect(r[0].is_eligible).toBe(true);
    expect(r[0].verdict).toBe("eligible_pending");
    // No LCA base is consulted on this path, so there is nothing to report about one.
    expect(r[0].lca_status).toBe("not_applicable");
    expect(r[0].pass_sport_code).toBeNull();
    // The code is minted later by data/2026/partners/franceconnect, which is also what
    // mails it — the worker names no template because it sends no outcome mail.
    expect(r[0].email_kind).toBeNull();
    expect(r[0].email_sent).toBe(false);

    // The accusé de réception, and strictly nothing else.
    expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
      String(TEMPLATE_IDS.acknowledgment),
    ]);
  });

  it("aucune route ouverte -> 'not_assessed', jamais 'not_eligible'", async () => {
    // AAH claimed, and the fake answers est_beneficiaire=false. Nothing was consulted that
    // could pronounce a refusal, so the verdict says the case was not settled rather than
    // claiming the person is not entitled.
    await stack.enqueueAndWait(selfCrous({ aides: ["AAH"] }));
    const r = await rows();

    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("self");
    expect(r[0].is_eligible).toBe(false);
    expect(r[0].verdict).toBe("not_assessed");
    expect(r[0].lca_status).toBe("not_applicable");
    expect(r[0].pass_sport_code).toBeNull();
  });

  it("ne demande plus la commune: ni colonne ni clé dans l'identité persistée", async () => {
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
    expect(r[0].residence_insee).toBeNull();
    // The sub is not duplicated into the jsonb: it has its own indexed column.
    expect(r[0].allocataire_fc_sub).toBe(sub);
    // A 'self' row describes the allocataire, so there is no enfant to store.
    expect(r[0].enfant_identite).toBeNull();
  });

  it("QF children chain -> une ligne par enfant, une seule enveloppe", async () => {
    const before = stack.sentEmails().length;

    // AEEH pulls QF, whose deterministic children each get their own row.
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const enfants = (await rows()).filter((x) => x.source === "enfant");

    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(enfants.every((x) => x.lca_status === "not_applicable")).toBe(true);
    expect(enfants.every((x) => x.pass_sport_code === null)).toBe(true);
    expect(enfants.every((x) => x.email_kind === null && x.email_sent === false)).toBe(true);

    // One accusé de réception for the job, and no per-beneficiary mail behind it.
    expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
      String(TEMPLATE_IDS.acknowledgment),
    ]);
  });

  // Nothing was claimed for the adult (AEEH is about the children), so they are not a
  // beneficiary candidate at all and get no row.
  it("aide enfants seule: l'adulte n'a aucune ligne", async () => {
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const all = await rows();

    expect(all.filter((x) => x.source === "self")).toHaveLength(0);
    // Not vacuous: the children of that same job did land.
    expect(all.filter((x) => x.source === "enfant").length).toBeGreaterThanOrEqual(1);
  });

  // No enfant came back, so the job has no beneficiary at all and eligibility_results stays
  // empty — a row here would be a verdict about nobody. The known cost: applications_by_sub
  // is derived from this table, so this usager is not recognised as having applied and a
  // resubmission re-runs the whole API Particulier chain.
  it("aide enfants sans enfant exploitable: aucune ligne", async () => {
    stack.setQfChildless(true);
    const before = stack.sentEmails().length;
    try {
      await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));

      expect(await rows()).toHaveLength(0);
      expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
        String(TEMPLATE_IDS.acknowledgment),
      ]);
    } finally {
      stack.setQfChildless(false);
    }
  });

  // Regression: this row used to not exist at all. An adult who declared AAH, was refused,
  // and had children left NOTHING in the table — which is exactly the case the site has to
  // be able to show them.
  it("AAH sans droit ouvert et des enfants: l'adulte a bien sa ligne", async () => {
    const before = stack.sentEmails().length;

    // AAH (the fake answers est_beneficiaire=false) + AEEH to pull QF and its children.
    await stack.enqueueAndWait(selfCrous({ aides: ["AAH", "AEEH"] }));
    const r = await rows();

    const self = r.filter((x) => x.source === "self");
    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("not_assessed");
    expect(self[0].is_eligible).toBe(false);

    expect(r.filter((x) => x.source === "enfant").length).toBeGreaterThan(0);

    // Whatever the outcome, the job's only mail is its accusé de réception.
    expect(stack.sentEmails().slice(before)).toHaveLength(1);
  });

  // The fake QF returns three children: 2008 (18 ans, AEEH window only), 2009 (17 ans,
  // both windows) and 2012 (14 ans, QF window only). The household quotient defaults to
  // 1000, i.e. above the 700 threshold.
  const eligibleBirthdates = async () =>
    (await rows())
      .filter((x) => x.source === "enfant" && x.is_eligible)
      .map((x) => x.enfant_identite?.birthdate)
      .sort();

  it("AEEH seule: seuls les 17-19 ans sont interrogés et peuvent être éligibles", async () => {
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }))) as {
      apCalls: number;
    };

    // 1 quotient_familial + 2 AEEH (2008 et 2009). Le cadet de 2012 n'est pas interrogé.
    expect(apCalls).toBe(3);
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01"]);
  });

  // Every candidate is recorded, eligible or not — the site needs a line for each child it
  // was asked about, not only for the ones a route carried.
  it("les enfants sans route ouverte sont enregistrés en 'not_assessed'", async () => {
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const enfants = (await rows()).filter((x) => x.source === "enfant");

    // The 2012 child is outside the AEEH window, so nothing was concluded about them.
    const cadet = enfants.find((x) => x.enfant_identite?.birthdate === "2012-01-01");
    expect(cadet).toBeDefined();
    expect(cadet.verdict).toBe("not_assessed");
    expect(cadet.is_eligible).toBe(false);

    const aine = enfants.find((x) => x.enfant_identite?.birthdate === "2008-01-01");
    expect(aine.verdict).toBe("eligible_pending");
  });

  // The site's PDF route needs an enfant's own gender (see site/src/app/api/france-connect/pdf)
  // — this is the QF fake's own sexe ("M" for Aine born 2008, "F" for Milieu born 2009,
  // per harness.ts), carried all the way through to what actually lands in Postgres.
  it("enfant_identite carries the QF-derived gender through to the persisted row", async () => {
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));

    const genderByBirthdate = Object.fromEntries(
      (await rows())
        .filter((x) => x.source === "enfant" && x.is_eligible)
        .map((x) => [x.enfant_identite?.birthdate, x.enfant_identite?.gender]),
    );

    expect(genderByBirthdate).toEqual({ "2008-01-01": "male", "2009-01-01": "female" });
  });

  it("QF seule au-dessus du seuil: aucun droit ouvert, aucun appel AEEH", async () => {
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }))) as {
      apCalls: number;
    };

    // quotient_familial seul: AEEH n'a pas été demandée, donc aucun appel par enfant.
    expect(apCalls).toBe(1);
    // Quotient à 1000, au-dessus du seuil: personne n'est éligible.
    expect(await eligibleBirthdates()).toEqual([]);
  });

  it("QF sous le seuil: les 6-17 ans éligibles sans appel AEEH", async () => {
    stack.setQfValeur(699);
    const { apCalls } = (await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }))) as {
      apCalls: number;
    };

    expect(apCalls).toBe(1);
    // 2009 (17 ans) et 2012 (14 ans) sont dans la fenêtre QF; 2008 (18 ans) non.
    expect(await eligibleBirthdates()).toEqual(["2009-01-01", "2012-01-01"]);
  });

  it("QF prioritaire sur AEEH pour le millésime 2009 partagé", async () => {
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
    stack.setQfValeur(700);
    await stack.enqueueAndWait(selfCrous({ aides: ["QF"] }));

    // Le seuil est strict: 700 n'est pas < 700.
    expect(await eligibleBirthdates()).toEqual([]);
  });

  it("ne pose jamais de code pass Sport, ni dans la table ni dans la valeur de retour", async () => {
    const ret = await stack.enqueueAndWait(selfCrous());

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].pass_sport_code).toBeNull();
    // BullMQ stores the return value in clear in Redis, behind neither a grant nor a
    // session — nothing that identifies a beneficiary belongs in it either.
    expect(JSON.stringify(ret)).not.toContain("PSP-");
  });

  // The view is what the site actually reads — the table being right is not enough.
  it("exposes the verdict through application_results_by_sub", async () => {
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
    expect(view.rows[0].verdict).toBe("eligible_pending");
    expect(view.rows[0].pass_sport_code).toBeNull();
  });

  // The site's dedup falls back to applications_by_sub once the job hash is gone
  // (removeOnComplete), so a completed job that writes no row would let this person
  // resubmit on every visit and re-burn the API Particulier quota.
  it("records an application even when no route is open", async () => {
    const sub = "fc-sub-nobody";
    // AAH only -> no quotient_familial call, so no children; and the fake answers
    // est_beneficiaire=false, so no route carries the allocataire either.
    await stack.enqueueAndWait({
      ...selfCrous({ aides: ["AAH"] }),
      identity: { ...selfCrous().identity, sub },
    });

    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].verdict).toBe("not_assessed");
    // The part that makes the dedup fallback work.
    expect(r[0].allocataire_fc_sub).toBe(sub);
  });

  it("audit trail records the IP and user-agent", async () => {
    await stack.enqueueAndWait({ ...selfCrous(), clientIp: "203.0.113.7", userAgent: "Mozilla/5.0 probe" });

    const audit = await stack.pool.query("select * from audit order by created_at desc limit 1");
    expect(audit.rows[0].ip_address).toBe("203.0.113.7");
    expect(audit.rows[0].user_agent).toBe("Mozilla/5.0 probe");
  });

  it("email send failure does not fail the job (les verdicts sont écrits quand même)", async () => {
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

    // Job completed (not failed) and the row persisted: a dead mailer costs the accusé de
    // réception, never the verdicts.
    expect(await stack.queue.getFailedCount()).toBe(0);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].verdict).toBe("eligible_pending");
  });

  // `email` is optional at every layer of the FranceConnect identity, and it is the only
  // address this path ever knew — there is nothing to fall back to.
  it("sans adresse FranceConnect: aucun envoi, les verdicts restent écrits", async () => {
    const sub = "sub-sans-email-fc";
    const before = stack.sentEmails().length;
    const { email: _email, ...identityWithoutEmail } = selfCrous().identity;

    await stack.enqueueAndWait({
      ...selfCrous(),
      identity: { ...identityWithoutEmail, sub },
    });

    expect(stack.sentEmails().slice(before)).toHaveLength(0);

    const r = (await rows()).filter((x) => x.allocataire_fc_sub === sub);
    expect(r).toHaveLength(1);
    expect(r[0].email).toBeNull();
    expect(r[0].email_sent).toBe(false);
    expect(r[0].verdict).toBe("eligible_pending");

    const skipped = (
      await stack.pool.query(
        "select action, status, response_payload from eligibility_history where allocataire_fc_sub = $1 and status = 'skipped' order by created_at, id",
        [sub],
      )
    ).rows;
    expect(skipped.map((e) => [e.action, e.response_payload.reason])).toEqual([
      ["email.acknowledgment", "no_recipient"],
    ]);
  });

  describe("accusé de réception", () => {
    it("part le premier, à l'adresse FranceConnect, et reste le seul mail du job", async () => {
      const before = stack.sentEmails().length;
      await stack.enqueueAndWait(selfCrous());

      const sent = stack.parsedEmails().slice(before);

      expect(sent.map((e) => e.templateId)).toEqual([String(TEMPLATE_IDS.acknowledgment)]);
      expect(sent[0].campaign).toBe("pass-sport-acknowledgment");
      // The address the usager authenticated with minutes ago.
      expect(sent[0].recipients).toEqual(["camille.martin@example.test"]);
      expect((await rows())[0].email).toBe("camille.martin@example.test");
      // The allocataire who just authenticated, and nothing about a beneficiary: none is
      // known this early.
      expect(sent[0].variables["camille.martin@example.test"]).toEqual({
        prenom: "Camille",
        nom: "Martin",
      });
    });

    it("is traced before the first API Particulier call", async () => {
      const sub = "sub-accuse-reception";
      await stack.enqueueAndWait({ ...selfCrous(), identity: { ...selfCrous().identity, sub } });

      const events = (
        await stack.pool.query(
          "select action, status, http_status from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
          [sub],
        )
      ).rows;

      expect(events[0].action).toBe("email.acknowledgment");
      expect(events[0].status).toBe("success");
      // What Link Mobility answered on the wire, not just our reading of its body.
      expect(events[0].http_status).toBe(200);
      // Not vacuous: the chain did run after it.
      expect(events.some((e) => e.action.startsWith("cnous."))).toBe(true);
      // And nothing was ever asked of LCA.
      expect(events.some((e) => e.action.startsWith("lca."))).toBe(false);
    });

    it("records the HTTP status Link Mobility answered, including when it is down", async () => {
      const sub = "sub-accuse-http-502";
      stack.setEmailHttpStatus(502);
      try {
        await stack.enqueueAndWait({ ...selfCrous(), identity: { ...selfCrous().identity, sub } });
      } finally {
        stack.setEmailHttpStatus(null);
      }

      const events = (
        await stack.pool.query(
          "select action, status, http_status, error from eligibility_history where allocataire_fc_sub = $1 and action = 'email.acknowledgment'",
          [sub],
        )
      ).rows;

      expect(events).toHaveLength(1);
      expect(events[0].status).toBe("error");
      // The point of the whole thing: a 502 is a blip a resend would fix, a 401 on a
      // rotated key is not, and the column is what tells them apart afterwards.
      expect(events[0].http_status).toBe(502);
      expect(events[0].error).toContain("502");

      // And the job carried on: a dead mailer costs the mail, never the verdicts.
      expect(await stack.queue.getFailedCount()).toBe(0);
      expect((await rows()).filter((x) => x.allocataire_fc_sub === sub)).toHaveLength(1);
    });

    it("falls back to the built-in template id when no env overrides it", async () => {
      const prev = process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT;
      delete process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT;
      const before = stack.sentEmails().length;
      try {
        await stack.enqueueAndWait(selfCrous());
      } finally {
        process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT = prev;
      }

      expect(stack.parsedEmails()[before].templateId).toBe("1188167");
    });
  });

  it("one row per beneficiary, no duplicates across repeated jobs", async () => {
    const data = selfCrous({ aides: ["CROUS", "AEEH"] }); // self (CROUS) + 3 children
    for (let i = 0; i < 3; i++) await stack.enqueueAndWait(data);

    const r = await rows();
    // 3 jobs x (1 self + 3 enfants) = 12 rows. Every child gets a row whether or not a
    // route carried them: the site was asked about each of them.
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
