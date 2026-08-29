import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LCA_COURRIEL, startStack, TEMPLATE_IDS, type Stack } from "./harness";

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

  // A confirm answering [] means LCA knows the person but has no code for them yet. That
  // is a verdict, not an incident: failing the job would retry four times over an answer
  // that will not change, then give up, and the usager would never hear back.
  it("empty confirm -> not_found, the job completes and still writes a verdict", async () => {
    stack.setLcaConfirmEmpty(true);

    try {
      await stack.enqueueAndWait(selfCrous());
      const r = await rows();

      expect(r).toHaveLength(1);
      expect(r[0].lca_status).toBe("not_found");
      // CROUS was claimed and the fake API Particulier says boursier, so our own route
      // still carries them.
      expect(r[0].is_eligible).toBe(true);
      expect(r[0].verdict).toBe("eligible_pending");
      expect(r[0].email_kind).toBe("eligible_soon");
      expect(r[0].pass_sport_code).toBeNull();
    } finally {
      stack.setLcaConfirmEmpty(false);
    }
  });

  it("QF children chain -> enfant rows confirmed with code email", async () => {
    const before = stack.sentEmails().length;

    // AEEH pulls QF, whose deterministic children are all sent to LCA.
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));
    const enfants = (await rows()).filter((x) => x.source === "enfant");

    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(enfants.every((x) => x.lca_status === "confirmed")).toBe(true);
    expect(enfants.every((x) => x.email_kind === "code" && x.email_sent === true)).toBe(true);
    expect(enfants.every((x) => x.verdict === "eligible_confirmed")).toBe(true);

    // One accusé de réception for the job, then one code mail per child.
    const sent = stack.parsedEmails().slice(before);
    expect(sent[0].templateId).toBe(String(TEMPLATE_IDS.acknowledgment));

    const codes = sent.slice(1);
    expect(codes).toHaveLength(enfants.length);
    expect(codes.every((e) => e.templateId === String(TEMPLATE_IDS.code))).toBe(true);
    expect(new Set(sent.flatMap((e) => e.recipients)).size).toBe(1);
  });

  // Nothing was claimed for the adult (AEEH is about the children), so they are not a
  // beneficiary candidate at all: no LCA call, and no row either. The row used to be
  // written as 'not_assessed' and filtered back out by the site — the allocataire simply
  // is not a beneficiary on a child route.
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
      // Only the accusé de réception, which is about the demande and not about a
      // beneficiary — no verdict mail, since there is no verdict.
      expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
        String(TEMPLATE_IDS.acknowledgment),
      ]);
    } finally {
      stack.setQfChildless(false);
    }
  });

  // Regression: this row used to not exist at all. The toProcess filter dropped a self
  // candidate with no route open, so an adult who declared AAH, was refused, and had
  // children left NOTHING in the table — which is exactly the refusal the site has to
  // show them.
  it("AAH refusée avec des enfants: l'adulte a bien une ligne 'not_eligible'", async () => {
    const before = stack.sentEmails().length;

    // AAH (the fake answers est_beneficiaire=false) + AEEH to pull QF and its children.
    await stack.enqueueAndWait(selfCrous({ aides: ["AAH", "AEEH"] }));
    const r = await rows();

    const self = r.filter((x) => x.source === "self");
    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("not_eligible");
    expect(self[0].lca_status).toBe("not_applicable");
    expect(self[0].is_eligible).toBe(false);

    // The children are unaffected — they still go through LCA on their own merit.
    const enfants = r.filter((x) => x.source === "enfant");
    expect(enfants.length).toBeGreaterThan(0);

    // The adult asked about AAH and was refused, so they are told, like every child was.
    expect(self[0].email_kind).toBe("not_eligible");
    expect(self[0].email_sent).toBe(true);
    // One per child, one for the refused adult, plus the job's accusé de réception.
    expect(stack.sentEmails().slice(before)).toHaveLength(enfants.length + 2);
  });

  // The fake QF returns three children: 2008 (18 ans, AEEH window only), 2009 (17 ans,
  // both windows) and 2012 (14 ans, QF window only). The household quotient defaults to
  // 1000, i.e. above the 700 threshold.
  //
  // The tests below are about OUR routes, so they take LCA out of the picture: a
  // confirmed LCA match sets is_eligible true on its own (jobs/france-connect.ts — the base is
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

  // The site's PDF route needs an enfant's own gender (see site/src/app/api/france-connect/pdf)
  // — this is the QF fake's own sexe ("M" for Aine born 2008, "F" for Milieu born 2009,
  // per harness.ts), carried all the way through to what actually lands in Postgres.
  it("enfant_identite carries the QF-derived gender through to the persisted row", async () => {
    routeOnly();
    await stack.enqueueAndWait(selfCrous({ aides: ["AEEH"] }));

    const genderByBirthdate = Object.fromEntries(
      (await rows())
        .filter((x) => x.source === "enfant" && x.is_eligible)
        .map((x) => [x.enfant_identite?.birthdate, x.enfant_identite?.gender]),
    );

    expect(genderByBirthdate).toEqual({ "2008-01-01": "male", "2009-01-01": "female" });
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
      // Declared in our own form, not served by FranceConnect — hence duplicated here from
      // the residence_insee column.
      residence_insee: "75113",
    });
    expect(r[0].residence_insee).toBe("75113");
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
    expect(r[0].email_kind).toBe("not_eligible");
    expect(r[0].email_sent).toBe(true);
    // They asked about themselves via AAH and the answer is no — a real refusal, not an
    // absence of question, so the site shows it and the refusal email goes out.
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

  it("mails the FranceConnect address, and the LCA one in local and staging", async () => {
    await stack.enqueueAndWait(selfCrous());

    // The address the usager authenticated with minutes ago, not the one the caisse recorded.
    // slice(-1): the accusé de réception went out first and always to the FranceConnect
    // address, so only the outcome mail can show which of the two won.
    const [deployed] = stack.parsedEmails().slice(-1);
    expect(deployed.recipients).toEqual(["camille.martin@example.test"]);
    expect((await rows())[0].email).toBe("camille.martin@example.test");

    const prevEnv = process.env.ENV;
    try {
      for (const env of ["local", "staging"]) {
        process.env.ENV = env;
        await stack.enqueueAndWait({
          ...selfCrous(),
          identity: { ...selfCrous().identity, sub: `sub-recipient-${env}` },
        });

        const [sent] = stack.parsedEmails().slice(-1);
        expect(sent.recipients).toEqual([LCA_COURRIEL]);
      }
    } finally {
      process.env.ENV = prevEnv;
    }
  });

  // The LCA courriel is a mailbox the usager never presented to us, and `email` is optional
  // at every layer of the FranceConnect identity — so outside local and staging there is no
  // falling back to it. The code stays in the table for the site to hand over instead.
  it("mails nobody rather than the LCA address when FranceConnect served no email", async () => {
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
    // Not a lost verdict: LCA confirmed and the code is there for the site to show.
    expect(r[0].pass_sport_code).toBe("PSP-CODE-123");

    const skipped = (
      await stack.pool.query(
        "select action, status, response_payload from eligibility_history where allocataire_fc_sub = $1 and status = 'skipped' order by created_at, id",
        [sub],
      )
    ).rows;
    expect(skipped.map((e) => [e.action, e.response_payload.reason])).toEqual([
      ["email.acknowledgment", "no_recipient"],
      ["email.skipped", "no_recipient"],
    ]);
  });

  it("falls back to the built-in template id when no env overrides it", async () => {
    const prev = process.env.LINK_MOBILITY_TEMPLATE_CODE;
    delete process.env.LINK_MOBILITY_TEMPLATE_CODE;
    const sub = "sub-default-template";
    try {
      await stack.enqueueAndWait({ ...selfCrous(), identity: { ...selfCrous().identity, sub } });
    } finally {
      process.env.LINK_MOBILITY_TEMPLATE_CODE = prev;
    }

    // Production is expected to run without any LINK_MOBILITY_TEMPLATE_* set at all.
    const [sent] = stack.parsedEmails().slice(-1);
    expect(sent.templateId).toBe("1187050");

    const r = (await rows()).filter((x) => x.allocataire_fc_sub === sub);
    expect(r).toHaveLength(1);
    expect(r[0].email_sent).toBe(true);
  });

  describe("accusé de réception", () => {
    it("leaves first, to the FranceConnect address, and does not replace the outcome mail", async () => {
      const before = stack.sentEmails().length;
      await stack.enqueueAndWait(selfCrous());

      const sent = stack.parsedEmails().slice(before);

      // Order is the whole point: it goes out before the chain that takes minutes.
      expect(sent.map((e) => e.templateId)).toEqual([
        String(TEMPLATE_IDS.acknowledgment),
        String(TEMPLATE_IDS.code),
      ]);
      expect(sent[0].campaign).toBe("pass-sport-acknowledgment");
      expect(sent[0].recipients).toEqual(["camille.martin@example.test"]);
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
