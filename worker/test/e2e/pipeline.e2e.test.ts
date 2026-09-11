import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EMAIL_TEMPLATES } from "../../src/email/notify";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";

// End-to-end pipeline tests against real Redis + Postgres (Testcontainers), a real
// BullMQ Worker, and a deterministic fake API Particulier (see harness.ts). Exercises:
// accusé de réception -> API Particulier chain -> one Postgres row per beneficiary. No LCA
// call and no outcome mail: this path hands out no code, it records who is eligible so the
// data/ pipeline can mint one later.
//
// The usager selects nothing: every resource is gated by its own birthdate window alone, and
// the harness pins the clock mid-septembre 2026 so the quotient_familial sweep is always two
// months (août, septembre) and the call counts below are stable.

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
  stack.setQfValeurByMois({});
  stack.setAahBeneficiaire(false);
  stack.setCrousBoursier(true);
  stack.setChildrenLastname("Enfant");
  stack.setQfFournisseur("CNAF");
});

const rows = async () =>
  (await stack.pool.query("select * from eligibility_results order by source, created_at")).rows;

const selfRows = async () => (await rows()).filter((x) => x.source === "self");
const enfantRows = async () => (await rows()).filter((x) => x.source === "enfant");

const historyActions = async (sub: string): Promise<string[]> =>
  (
    await stack.pool.query(
      "select action from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
      [sub],
    )
  ).rows.map((e) => e.action);

// Born 2004: inside the AAH window (1996-2010) AND the CROUS one (1998-2026), so both self
// resources are queried. The fake answers est_beneficiaire=false and est_boursier=true.
const allocataire = (overrides: Record<string, unknown> = {}) => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
  },
  isFranceConnected: true,
  ...overrides,
});

// Born 1985: outside both self windows, so neither AAH nor CROUS is called and no self row
// is written — a verdict about someone nobody was asked about would be a lie.
const allocataireHorsFenetres = (overrides: Record<string, unknown> = {}) =>
  allocataire({
    identity: { ...allocataire().identity, birthdate: "1985-07-03" },
    ...overrides,
  });

describe("worker eligibility pipeline (deterministic fakes)", () => {
  it("route ouverte -> une ligne 'eligible_pending', sans code ni mail de résultat", async () => {
    const before = stack.sentEmails().length;
    await stack.enqueueAndWait(allocataire());
    const self = await selfRows();

    expect(self).toHaveLength(1);
    expect(self[0].is_eligible).toBe(true);
    expect(self[0].verdict).toBe("eligible_pending");
    // No LCA base is consulted on this path, so there is nothing to report about one.
    expect(self[0].lca_status).toBe("not_applicable");
    expect(self[0].pass_sport_code).toBeNull();
    // The code is minted later by data/2026/partners/franceconnect, which is also what
    // mails it — the worker names no template because it sends no outcome mail.
    expect(self[0].email_kind).toBeNull();
    expect(self[0].email_sent).toBe(false);

    // The accusé de réception, and strictly nothing else.
    expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
      String(TEMPLATE_IDS.acknowledgment),
    ]);
  });

  it("aucune route ouverte -> 'not_eligible'", async () => {
    // Both self resources answered no. That IS a determination — a refusal we can pronounce —
    // where an outage would have failed the job before reaching this table.
    stack.setAahBeneficiaire(false);
    stack.setCrousBoursier(false);
    stack.setQfChildless(true);
    try {
      await stack.enqueueAndWait(allocataire());
      const r = await rows();

      expect(r).toHaveLength(1);
      expect(r[0].source).toBe("self");
      expect(r[0].is_eligible).toBe(false);
      expect(r[0].verdict).toBe("not_eligible");
      expect(r[0].lca_status).toBe("not_applicable");
      expect(r[0].pass_sport_code).toBeNull();
      // No outcome mail on this path: the verdict is read on the site.
      expect(r[0].email_kind).toBeNull();
      expect(r[0].email_sent).toBe(false);
    } finally {
      stack.setQfChildless(false);
    }
  });

  it("ne demande plus la commune: ni colonne ni clé dans l'identité persistée", async () => {
    const sub = "fc-sub-identite";
    await stack.enqueueAndWait({
      ...allocataire(),
      identity: { ...allocataire().identity, sub },
    });

    const self = await selfRows();
    expect(self[0].allocataire_identite).toEqual({
      family_name: "Martin",
      given_name: "Camille",
      birthdate: "2004-05-15",
      gender: "female",
      birthplace: "75056",
      birthcountry: "99100",
      email: "camille.martin@example.test",
    });
    expect(self[0].residence_insee).toBeNull();
    // The sub is not duplicated into the jsonb: it has its own indexed column.
    expect(self[0].allocataire_fc_sub).toBe(sub);
    // A 'self' row describes the allocataire, so there is no enfant to store.
    expect(self[0].enfant_identite).toBeNull();
  });

  it("le nom d'usage de l'allocataire est persisté quand FranceConnect en sert un", async () => {
    const sub = "fc-sub-nom-usage";
    await stack.enqueueAndWait({
      ...allocataire(),
      identity: { ...allocataire().identity, sub, preferred_username: "Vorsalde" },
    });

    const self = await selfRows();
    expect(self[0].allocataire_identite.preferred_username).toBe("Vorsalde");
    expect(self[0].allocataire_identite.family_name).toBe("Martin");
  });

  it("QF children chain -> une ligne par enfant, une seule enveloppe", async () => {
    const before = stack.sentEmails().length;

    await stack.enqueueAndWait(allocataire());
    const enfants = await enfantRows();

    expect(enfants.length).toBeGreaterThanOrEqual(1);
    expect(enfants.every((x) => x.lca_status === "not_applicable")).toBe(true);
    expect(enfants.every((x) => x.pass_sport_code === null)).toBe(true);
    expect(enfants.every((x) => x.email_kind === null && x.email_sent === false)).toBe(true);

    // One accusé de réception for the job, and no per-beneficiary mail behind it.
    expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
      String(TEMPLATE_IDS.acknowledgment),
    ]);
  });

  // The quotient caisse is household-level, so it lands on every row it applies to.
  it("la caisse du quotient est écrite sur les lignes enfant", async () => {
    await stack.enqueueAndWait(allocataire());

    const enfants = await enfantRows();
    expect(enfants.length).toBeGreaterThan(0);
    expect(enfants.every((x) => x.caisse === "CAF")).toBe(true);

    await stack.pool.query("TRUNCATE eligibility_results");
    stack.setQfFournisseur("MSA");
    await stack.enqueueAndWait(allocataire());

    expect((await enfantRows()).every((x) => x.caisse === "MSA")).toBe(true);
  });

  // The bourse comes from CNOUS, not from the caisse that served the household quotient —
  // which is answering CNAF on this very job.
  it("route boursier: la caisse est 'cnous', pas celle du quotient", async () => {
    await stack.enqueueAndWait(allocataire());

    const self = await selfRows();
    expect(self).toHaveLength(1);
    expect(self[0].situation).toBe("boursier");
    expect(self[0].caisse).toBe("cnous");
    // Not vacuous: the same job wrote the quotient caisse on its other rows.
    expect((await enfantRows()).every((x) => x.caisse === "CAF")).toBe(true);
  });

  // A quotient payload naming no fournisseur: null rather than a guessed CAF.
  it("aucun fournisseur annoncé: la caisse reste nulle", async () => {
    stack.setQfFournisseur(undefined);
    await stack.enqueueAndWait(allocataire());

    expect((await enfantRows()).every((x) => x.caisse === null)).toBe(true);
  });

  // The self gate: a row about the allocataire exists only when a self resource was actually
  // queried, which is decided by their birthdate alone now that nothing is claimed.
  it("allocataire hors des fenêtres AAH/CROUS: aucune ligne, aucun appel self", async () => {
    const sub = "fc-sub-hors-fenetres";
    const { apCalls } = (await stack.enqueueAndWait({
      ...allocataireHorsFenetres(),
      identity: { ...allocataireHorsFenetres().identity, sub },
    })) as { apCalls: number };

    // 2 quotient_familial (août, septembre) + 3 AEEH. Neither AAH nor CROUS.
    expect(apCalls).toBe(5);

    const actions = await historyActions(sub);
    expect(actions.some((a) => a.startsWith("dss.allocation_adulte_handicape"))).toBe(false);
    expect(actions.some((a) => a.startsWith("cnous."))).toBe(false);

    expect(await selfRows()).toHaveLength(0);
    // Not vacuous: the children of that same job did land.
    expect((await enfantRows()).length).toBeGreaterThanOrEqual(1);
  });

  // No enfant came back and the allocataire is outside both self windows, so nobody was queried
  // about anything. They are still recorded: applications_by_sub is derived from this table, and
  // an empty run would let every reconnection re-burn the whole chain while /result polls on a
  // list that never fills.
  it("aucune route nulle part: l'allocataire est tout de même enregistré", async () => {
    const sub = "fc-sub-repli-allocataire";
    stack.setQfChildless(true);
    const before = stack.sentEmails().length;
    try {
      await stack.enqueueAndWait({
        ...allocataireHorsFenetres(),
        identity: { ...allocataireHorsFenetres().identity, sub },
      });

      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0].source).toBe("self");
      expect(r[0].verdict).toBe("not_eligible");
      expect(r[0].is_eligible).toBe(false);
      // What makes the dedup fallback recognise them on the next connection.
      expect(r[0].allocataire_fc_sub).toBe(sub);

      const applications = await stack.pool.query(
        "select * from applications_by_sub where sub = $1",
        [sub],
      );
      expect(applications.rows).toHaveLength(1);

      expect(stack.parsedEmails().slice(before).map((e) => e.templateId)).toEqual([
        String(TEMPLATE_IDS.acknowledgment),
      ]);
    } finally {
      stack.setQfChildless(false);
    }
  });

  // The fallback is a last resort, not an extra row: a parent whose children carry the job has
  // no business being shown a refusal about themselves.
  it("le repli ne s'applique pas quand des enfants sont enregistrés", async () => {
    await stack.enqueueAndWait(allocataireHorsFenetres());

    expect(await selfRows()).toHaveLength(0);
    expect(await enfantRows()).toHaveLength(4);
  });

  // Regression: this row used to not exist at all. An adult who was refused and had children
  // left NOTHING in the table — which is exactly the case the site has to be able to show them.
  it("allocataire sans droit ouvert et des enfants: l'adulte a bien sa ligne", async () => {
    const before = stack.sentEmails().length;
    stack.setCrousBoursier(false);

    await stack.enqueueAndWait(allocataire());

    const self = await selfRows();
    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("not_eligible");
    expect(self[0].is_eligible).toBe(false);

    expect((await enfantRows()).length).toBeGreaterThan(0);

    // Whatever the outcome, the job's only mail is its accusé de réception.
    expect(stack.sentEmails().slice(before)).toHaveLength(1);
  });

  // A positive AAH already carries the allocataire: a second route about the same person
  // would change nothing and is the chain's only short-circuit.
  it("AAH ouverte: l'appel CROUS est économisé", async () => {
    const sub = "fc-sub-aah-court-circuit";
    stack.setAahBeneficiaire(true);

    const { apCalls } = (await stack.enqueueAndWait({
      ...allocataire(),
      identity: { ...allocataire().identity, sub },
    })) as { apCalls: number };

    // 2 quotient_familial + 1 AAH + 3 AEEH. Pas de CROUS.
    expect(apCalls).toBe(6);
    expect((await historyActions(sub)).some((a) => a.startsWith("cnous."))).toBe(false);

    const self = await selfRows();
    expect(self[0].verdict).toBe("eligible_pending");
  });

  // The fake QF returns four children: 2005 (21 ans, outside both windows), 2008 (18 ans,
  // AEEH window only), 2009 (17 ans) and 2012 (14 ans, both windows). The household quotient
  // defaults to 1000, i.e. above the 700 threshold.
  const eligibleBirthdates = async () =>
    (await enfantRows())
      .filter((x) => x.is_eligible)
      .map((x) => x.enfant_identite?.birthdate)
      .sort();

  it("chaque enfant 6-19 hors couverture QF est interrogé", async () => {
    const { apCalls } = (await stack.enqueueAndWait(allocataire())) as { apCalls: number };

    // 2 quotient_familial + AAH + CROUS + 3 AEEH. L'enfant de 2005 est hors fenêtre.
    expect(apCalls).toBe(7);
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01", "2012-01-01"]);
  });

  // Every candidate is recorded, eligible or not — the site needs a line for each child of the
  // household, not only for the ones a route carried.
  it("les enfants sans route ouverte sont enregistrés en 'not_eligible'", async () => {
    await stack.enqueueAndWait(allocataire());
    const enfants = await enfantRows();

    // The 2005 child is outside both windows: our own campaign rules exclude them, which is a
    // determination and not an absence of one.
    const adulte = enfants.find((x) => x.enfant_identite?.birthdate === "2005-01-01");
    expect(adulte).toBeDefined();
    expect(adulte.verdict).toBe("not_eligible");
    expect(adulte.is_eligible).toBe(false);

    const aine = enfants.find((x) => x.enfant_identite?.birthdate === "2008-01-01");
    expect(aine.verdict).toBe("eligible_pending");
  });

  // The site's PDF route needs an enfant's own gender (see site/src/app/api/france-connect/pdf)
  // — this is the QF fake's own sexe, carried all the way through to what lands in Postgres.
  it("enfant_identite carries the QF-derived gender through to the persisted row", async () => {
    await stack.enqueueAndWait(allocataire());

    const genderByBirthdate = Object.fromEntries(
      (await enfantRows())
        .filter((x) => x.is_eligible)
        .map((x) => [x.enfant_identite?.birthdate, x.enfant_identite?.gender]),
    );

    expect(genderByBirthdate).toEqual({
      "2008-01-01": "male",
      "2009-01-01": "female",
      "2012-01-01": "female",
    });
  });

  // Stored for the code write-back, which will match on identity. The row still NAMES the child
  // by their nom de naissance — that is the name the AEEH call went out under.
  it("enfant_identite carries the nom d'usage without naming the child by it", async () => {
    await stack.enqueueAndWait(allocataire());

    const cadet = (await enfantRows()).find((x) => x.enfant_identite?.birthdate === "2012-01-01");
    expect(cadet.enfant_identite.family_name).toBe("Enfant");
    expect(cadet.enfant_identite.preferred_username).toBe("Bravenne");

    const milieu = (await enfantRows()).find((x) => x.enfant_identite?.birthdate === "2009-01-01");
    expect(milieu.enfant_identite.preferred_username).toBeUndefined();
  });

  it("QF sous le seuil: les 6-17 ans éligibles sans appel AEEH", async () => {
    stack.setQfValeur(699);
    const { apCalls } = (await stack.enqueueAndWait(allocataire())) as { apCalls: number };

    // 1 quotient_familial — le balayage s'arrête sur août — + AAH + CROUS + 1 seul AEEH:
    // l'aîné de 2008 est hors fenêtre QF, 2009 et 2012 sont déjà couverts par le quotient.
    expect(apCalls).toBe(4);
    // 2009 et 2012 par le quotient, 2008 par son verdict AEEH.
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01", "2012-01-01"]);
  });

  // The sweep stops on the first month satisfying the criterion, so the deciding answer is
  // always the last one — which is also the row data/'s export reads back.
  it("balaie les mois jusqu'au premier quotient sous le seuil", async () => {
    stack.setQfValeurByMois({ "8": 900, "9": 650 });
    const { apCalls } = (await stack.enqueueAndWait(allocataire())) as { apCalls: number };

    // 2 quotient_familial (août au-dessus, septembre en dessous) + AAH + CROUS + 1 AEEH.
    expect(apCalls).toBe(5);
    expect(await eligibleBirthdates()).toEqual(["2008-01-01", "2009-01-01", "2012-01-01"]);
  });

  it("le seuil est strict: 700 ne fait pas cesser le balayage, 699 oui", async () => {
    stack.setQfValeur(700);
    const auSeuil = (await stack.enqueueAndWait(allocataire())) as { apCalls: number };

    await stack.pool.query("TRUNCATE eligibility_results");
    stack.setQfValeur(699);
    const sousLeSeuil = (await stack.enqueueAndWait(
      allocataire({ identity: { ...allocataire().identity, sub: "fc-sub-699" } }),
    )) as { apCalls: number };

    // 700 n'est pas < 700: le second mois est interrogé, puis les trois AEEH.
    expect(auSeuil.apCalls).toBe(7);
    expect(sousLeSeuil.apCalls).toBe(4);
  });

  it("ne pose jamais de code pass Sport, ni dans la table ni dans la valeur de retour", async () => {
    const ret = await stack.enqueueAndWait(allocataire());

    const r = await rows();
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.pass_sport_code === null)).toBe(true);
    // BullMQ stores the return value in clear in Redis, behind neither a grant nor a
    // session — nothing that identifies a beneficiary belongs in it either.
    expect(JSON.stringify(ret)).not.toContain("PSP-");
  });

  // The view is what the site actually reads — the table being right is not enough.
  it("exposes the verdict through application_results_by_sub", async () => {
    const sub = "fc-sub-code-view";
    await stack.enqueueAndWait({
      ...allocataire(),
      identity: { ...allocataire().identity, sub },
    });

    const view = await stack.pool.query(
      "select * from application_results_by_sub where sub = $1 and source = 'self'",
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
    stack.setAahBeneficiaire(false);
    stack.setCrousBoursier(false);
    stack.setQfChildless(true);
    try {
      await stack.enqueueAndWait({
        ...allocataire(),
        identity: { ...allocataire().identity, sub },
      });

      const r = await rows();
      expect(r).toHaveLength(1);
      expect(r[0].verdict).toBe("not_eligible");
      // The part that makes the dedup fallback work.
      expect(r[0].allocataire_fc_sub).toBe(sub);
    } finally {
      stack.setQfChildless(false);
    }
  });

  it("audit trail records the IP and user-agent", async () => {
    await stack.enqueueAndWait({
      ...allocataire(),
      clientIp: "203.0.113.7",
      userAgent: "Mozilla/5.0 probe",
    });

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
      await stack.enqueueAndWait(allocataire());
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
    const self = await selfRows();
    expect(self).toHaveLength(1);
    expect(self[0].verdict).toBe("eligible_pending");
  });

  // `email` is optional at every layer of the FranceConnect identity, and it is the only
  // address this path ever knew — there is nothing to fall back to.
  it("sans adresse FranceConnect: aucun envoi, les verdicts restent écrits", async () => {
    const sub = "sub-sans-email-fc";
    const before = stack.sentEmails().length;
    const { email: _email, ...identityWithoutEmail } = allocataire().identity;

    await stack.enqueueAndWait({
      ...allocataire(),
      identity: { ...identityWithoutEmail, sub },
    });

    expect(stack.sentEmails().slice(before)).toHaveLength(0);

    const self = (await selfRows()).filter((x) => x.allocataire_fc_sub === sub);
    expect(self).toHaveLength(1);
    expect(self[0].email).toBeNull();
    expect(self[0].email_sent).toBe(false);
    expect(self[0].verdict).toBe("eligible_pending");

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
      await stack.enqueueAndWait(allocataire());

      const sent = stack.parsedEmails().slice(before);

      expect(sent.map((e) => e.templateId)).toEqual([String(TEMPLATE_IDS.acknowledgment)]);
      expect(sent[0].campaign).toBe("pass-sport-acknowledgment");
      // The address the usager authenticated with minutes ago.
      expect(sent[0].recipients).toEqual(["camille.martin@example.test"]);
      expect((await selfRows())[0].email).toBe("camille.martin@example.test");
      // The allocataire who just authenticated, and nothing about a beneficiary: none is
      // known this early.
      expect(sent[0].variables["camille.martin@example.test"]).toEqual({
        prenom: "Camille",
        nom: "Martin",
      });
    });

    it("is traced before the first API Particulier call", async () => {
      const sub = "sub-accuse-reception";
      await stack.enqueueAndWait({
        ...allocataire(),
        identity: { ...allocataire().identity, sub },
      });

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
      // The chain does run after it, and quotient_familial always opens it.
      expect(events[1].action).toBe("dss.quotient_familial_identite");
      // And nothing was ever asked of LCA.
      expect(events.some((e) => e.action.startsWith("lca."))).toBe(false);
    });

    it("records the HTTP status Link Mobility answered, including when it is down", async () => {
      const sub = "sub-accuse-http-502";
      stack.setEmailHttpStatus(502);
      try {
        await stack.enqueueAndWait({
          ...allocataire(),
          identity: { ...allocataire().identity, sub },
        });
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
      expect((await selfRows()).filter((x) => x.allocataire_fc_sub === sub)).toHaveLength(1);
    });

    it("falls back to the built-in template id when no env overrides it", async () => {
      const prev = process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT;
      delete process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT;
      const before = stack.sentEmails().length;
      try {
        await stack.enqueueAndWait(allocataire());
      } finally {
        process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT = prev;
      }

      // The built-in id, not the one the harness pins in the env — read from the source of
      // truth so changing a template does not mean chasing a literal down here.
      const builtIn = EMAIL_TEMPLATES.acknowledgment.templateId;
      expect(builtIn).not.toBe(TEMPLATE_IDS.acknowledgment);
      expect(stack.parsedEmails()[before].templateId).toBe(String(builtIn));
    });
  });

  it("one row per beneficiary, no duplicates across repeated jobs", async () => {
    const data = allocataire();
    for (let i = 0; i < 3; i++) await stack.enqueueAndWait(data);

    const r = await rows();
    // 3 jobs x (1 self + 4 enfants) = 15 rows. Every child gets a row whether or not a
    // route carried them: the site was asked about each of them.
    expect(r).toHaveLength(15);

    // Each job produced exactly one self row and one row per child.
    const byJob = new Map<string, string[]>();
    for (const row of r) {
      const list = byJob.get(row.job_id) ?? [];
      list.push(row.source);
      byJob.set(row.job_id, list);
    }
    expect(byJob.size).toBe(3);
    for (const sources of byJob.values()) {
      expect(sources.sort()).toEqual(["enfant", "enfant", "enfant", "enfant", "self"]);
    }
  });
});
