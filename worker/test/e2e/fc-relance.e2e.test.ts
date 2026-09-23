import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { FC_RELANCE_JOB_NAME, FRANCE_CONNECT_JOB_NAME } from "../../src/queues";

// La relance rejoue toute la chaîne API Particulier pour un foyer déjà refusé et AMENDE ses
// lignes : jamais une de plus, jamais une rétrogradation. Le scénario ci-dessous refuse tout au
// premier passage (quotient au-dessus du seuil, ni AAH ni bourse ni AEEH), puis fait passer le
// quotient sous 700 — ce qui n'ouvre la route QF qu'aux enfants dans la fenêtre 2009-2020.
//
// Les quatre enfants du faux client, à la date de référence 2026-12-31 :
//   Adulte 2005 -> 21 ans, hors des deux fenêtres
//   Aine   2008 -> 18 ans, fenêtre AEEH seulement
//   Milieu 2009 -> 17 ans, fenêtre QF
//   Cadet  2012 -> 14 ans, fenêtre QF

let stack: Stack;

const sub = "fc-sub-relance";

// Un autre allocataire, pour la vérification de priorité : deux jobs ne peuvent coexister
// sous le même id.
const otherSub = "fc-sub-relance-voisin";

const identity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "2004-05-15",
  gender: "female" as const,
  birthplace: "75056",
  birthcountry: "99100",
  email: "velmorak.ostrenya@example.test",
  sub,
};

const input = { identity, isFranceConnected: true };

// Une ligne déjà confirmée, ANTÉRIEURE au run initial : elle ne fait donc pas partie du dernier
// run et n'a aucune raison d'être touchée — ni par le périmètre, ni par les gardes optimistes.
let confirmedRowId: string;

const rows = async () =>
  (
    await stack.pool.query(
      "select * from eligibility_results where allocataire_fc_sub = $1 order by source, (enfant_identite->>'given_name')",
      [sub],
    )
  ).rows;

const history = async () =>
  (
    await stack.pool.query(
      "select * from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
      [sub],
    )
  ).rows;

const relanceEvents = async () => (await history()).filter((e) => e.action === "fc_relance");

const childRow = async (givenName: string) =>
  (await rows()).find((r) => r.enfant_identite?.given_name === givenName);

// Snapshot pris juste après le run initial, pour prouver qu'aucune ligne n'a bougé d'identité.
let rowsBeforeRelance: Record<string, unknown>[];
let apiCallsAfterRelance: number;

beforeAll(async () => {
  stack = await startStack();

  stack.setAahBeneficiaire(false);
  stack.setCrousBoursier(false);
  stack.setAeehBeneficiaire(false);

  confirmedRowId = await stack.seedConfirmedRow({ sub, code: "24-ZORV-QYXA" });

  await stack.enqueueAndWait(input, sub);
  rowsBeforeRelance = await rows();

  stack.setQfValeur(500);
  await stack.enqueueRelanceAndWait(input, sub);
  apiCallsAfterRelance = stack.apiCallCount();
}, 240_000);

afterAll(async () => {
  await stack?.close();
});

describe("la relance amende les lignes du dernier run sans jamais en créer", () => {
  it("part d'un run initial entièrement refusé", () => {
    const lastRun = rowsBeforeRelance.filter((r) => r.id !== confirmedRowId);

    // Le foyer : l'allocataire plus les quatre enfants du quotient familial.
    expect(lastRun).toHaveLength(5);
    expect(lastRun.every((r) => r.verdict === "not_eligible")).toBe(true);
  });

  // Le compte seul laisserait passer une ligne supprimée et une ligne créée : c'est l'ENSEMBLE
  // des identifiants qui doit être le même, et c'est l'invariant central de la fonctionnalité.
  it("n'ajoute aucune ligne", async () => {
    const ids = (rs: Record<string, unknown>[]) => rs.map((r) => r.id as string).sort();

    expect(ids(await rows())).toEqual(ids(rowsBeforeRelance));
  });

  it("fait passer les enfants que le nouveau quotient couvre en eligible_pending", async () => {
    const milieu = await childRow("Milieu");
    const avant = rowsBeforeRelance.find(
      (r) => (r.enfant_identite as { given_name?: string } | null)?.given_name === "Milieu",
    );

    expect(milieu.verdict).toBe("eligible_pending");
    expect(milieu.is_eligible).toBe(true);
    expect(milieu.situation).toBe("QF");
    expect(milieu.caisse).toBe("CAF");

    // La MÊME ligne : ni id ni created_at ne bougent, et les colonnes d'identité non plus —
    // c'est sur elles que le rapprochement du pipeline data/ s'appuie.
    expect(milieu.id).toBe(avant!.id);
    expect(milieu.created_at).toEqual(avant!.created_at);
    expect(milieu.enfant_identite).toEqual(avant!.enfant_identite);
    expect(milieu.allocataire_identite).toEqual(avant!.allocataire_identite);
  });

  // Ce qui la rend éligible au job fc_code_emails une fois que data/ lui aura frappé un code.
  it("laisse la ligne relevée jamais courriellée", async () => {
    const milieu = await childRow("Milieu");

    expect(milieu.email_kind).toBeNull();
    expect(milieu.email_sent).toBe(false);
    expect(milieu.pass_sport_code).toBeNull();
  });

  it("ne relève pas un enfant hors de la fenêtre QF", async () => {
    expect((await childRow("Aine")).verdict).toBe("not_eligible");
    expect((await childRow("Adulte")).verdict).toBe("not_eligible");
  });

  // Posé par le trigger eligibility_results_set_updated_at (drizzle/0006), pas par l'écrivain :
  // le BEFORE UPDATE n'a pas de clause WHEN, donc l'UPDATE de la relance le réarme comme
  // n'importe quel autre. C'est ce qui date la remontée — created_at, lui, reste celui du run
  // initial — et c'est aussi la colonne sur laquelle le balayage fc_code_emails trie.
  it("réarme updated_at sur les seules lignes qu'elle a relevées", async () => {
    const avant = (name: string) =>
      rowsBeforeRelance.find(
        (r) => (r.enfant_identite as { given_name?: string } | null)?.given_name === name,
      )!.updated_at as Date;

    const milieu = await childRow("Milieu");
    expect((milieu.updated_at as Date).getTime()).toBeGreaterThan(avant("Milieu").getTime());
    expect((milieu.updated_at as Date).getTime()).toBeGreaterThan(
      (milieu.created_at as Date).getTime(),
    );

    // Une ligne qu'aucun UPDATE n'a visée ne voit pas son horodatage bouger : la relance ne
    // ratisse pas la table, elle écrit ligne à ligne. Sur le parcours FranceConnect, une ligne
    // qui RESTE 'not_eligible' n'est donc jamais la cible d'un UPDATE, et son updated_at ne
    // quitte jamais son created_at — les deux DEFAULT now() du même INSERT.
    const aine = await childRow("Aine");
    expect((aine.updated_at as Date).getTime()).toBe(avant("Aine").getTime());
    expect(aine.updated_at).toEqual(aine.created_at);
  });

  it("ne rétrograde jamais, et ne touche pas une ligne déjà codée", async () => {
    const confirmed = (await rows()).find((r) => r.id === confirmedRowId);

    expect(confirmed.verdict).toBe("eligible_confirmed");
    expect(confirmed.pass_sport_code).toBe("24-ZORV-QYXA");
    expect(confirmed.is_eligible).toBe(true);
  });

  it("trace une ligne fc_relance par bénéficiaire re-jugé, sous le sub", async () => {
    const events = await relanceEvents();

    expect(events).toHaveLength(5);
    expect(events.every((e) => e.job_id === sub)).toBe(true);
    expect(events.every((e) => e.actor === "worker")).toBe(true);
    expect(events.filter((e) => e.response_payload.updated === true)).toHaveLength(2);

    const releve = events.find((e) => e.response_payload.updated === true);
    expect(releve.subject).toBe("enfant");
    expect(releve.response_payload.verdict_avant).toBe("not_eligible");
    expect(releve.response_payload.verdict_apres).toBe("eligible_pending");
    expect(releve.response_payload.situation_apres).toBe("QF");
  });

  it("historise ses appels API sous leurs actions habituelles et le même job_id", async () => {
    const qf = (await history()).filter((e) => e.action === "dss.quotient_familial_identite");

    // Le run initial balaie août puis septembre, aucun des deux ne passant sous le seuil ; la
    // relance s'arrête sur août, qui y passe. Le balayage est bien rejoué en entier — c'est lui
    // qui commande la route QF des enfants et le déclenchement des appels AEEH.
    expect(qf).toHaveLength(3);
    expect(qf.every((e) => e.job_id === sub)).toBe(true);
  });

  // La relance n'est pas une nouvelle demande : l'accusé de réception ne repart pas.
  it("n'envoie pas de second accusé de réception", async () => {
    const acks = (await history()).filter((e) => e.action === "email.acknowledgment");

    expect(acks).toHaveLength(1);
  });
});

describe("le quota est tenu par le worker, pas seulement par le site", () => {
  it("refuse une seconde relance immédiate sans dépenser un seul appel", async () => {
    const before = stack.apiCallCount();

    await stack.enqueueRelanceAndWait(input, sub);

    expect(stack.apiCallCount()).toBe(before);
    expect(before).toBe(apiCallsAfterRelance);

    const refus = (await relanceEvents()).filter((e) => e.status === "skipped");
    expect(refus).toHaveLength(1);
    expect(refus[0].response_payload.raison).toBe("quota");
  });

  it("n'a toujours ajouté aucune ligne", async () => {
    expect(await rows()).toHaveLength(rowsBeforeRelance.length);
  });
});

describe("une relance ne passe jamais devant une première demande", () => {
  const voisinSub = "fc-sub-relance-priorite";

  it("sert la demande initiale d'abord, bien qu'elle ait été posée après", async () => {
    await stack.queue.pause();

    // La relance d'abord, sous priority 1 comme le fait le site ; la demande initiale ensuite,
    // sans priorité — dans BullMQ c'est elle qui passe devant.
    const relance = await stack.queue.add(FC_RELANCE_JOB_NAME, input, {
      jobId: sub,
      priority: 1,
    });
    const demande = await stack.queue.add(
      FRANCE_CONNECT_JOB_NAME,
      { identity: { ...identity, sub: voisinSub }, isFranceConnected: true },
      { jobId: voisinSub },
    );

    await stack.queue.resume();

    for (const job of [demande, relance]) {
      for (let i = 0; i < 200; i++) {
        const state = await (await stack.queue.getJob(job.id!))?.getState();
        if (state === "completed") break;
        if (state === "failed") throw new Error(`job ${job.id} a échoué`);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // startJob écrit une ligne audit à l'ouverture de chaque job, et la file tourne à
    // concurrence 1 : l'ordre de cette table EST l'ordre de traitement.
    const { rows: audits } = await stack.pool.query(
      "select job_name, job_id from audit where job_id = any($1) order by created_at",
      [[sub, voisinSub]],
    );

    expect(audits.at(-1)).toMatchObject({ job_name: "fc-relance-job", job_id: sub });
    expect(audits.at(-2)).toMatchObject({ job_name: "france-connect-job", job_id: voisinSub });
  });
});

describe("un foyer sans refus à reprendre", () => {
  it("s'arrête avant le moindre appel API", async () => {
    const before = stack.apiCallCount();

    await stack.enqueueRelanceAndWait(
      { identity: { ...identity, sub: otherSub }, isFranceConnected: true },
      otherSub,
    );

    expect(stack.apiCallCount()).toBe(before);

    const { rows: events } = await stack.pool.query(
      "select status, response_payload from eligibility_history where allocataire_fc_sub = $1 and action = 'fc_relance'",
      [otherSub],
    );

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("skipped");
    expect(events[0].response_payload.raison).toBe("aucun_not_eligible");
  });
});

describe("relance restreinte à la liste de test (FC_RELANCE_ALLOWLIST_ONLY)", () => {
  // Deux foyers : la trace d'une relance refusée compte dans le quota du sub.
  const aucunAutoriseSub = "fc-sub-relance-liste-aucun";
  const unAutoriseSub = "fc-sub-relance-liste-un";

  const inputFor = (s: string) => ({ identity: { ...identity, sub: s }, isFranceConnected: true });

  const rowsFor = async (s: string) =>
    (
      await stack.pool.query(
        "select * from eligibility_results where allocataire_fc_sub = $1",
        [s],
      )
    ).rows;

  const relanceEventsFor = async (s: string) =>
    (
      await stack.pool.query(
        "select status, subject, response_payload from eligibility_history where allocataire_fc_sub = $1 and action = 'fc_relance'",
        [s],
      )
    ).rows;

  beforeAll(async () => {
    stack.setQfValeur(1000);
    await stack.enqueueAndWait(inputFor(aucunAutoriseSub), aucunAutoriseSub);
    await stack.enqueueAndWait(inputFor(unAutoriseSub), unAutoriseSub);

    await stack.pool.query(
      "update eligibility_results set relance_allowed = true where allocataire_fc_sub = $1 and enfant_identite->>'given_name' = 'Milieu'",
      [unAutoriseSub],
    );

    stack.setQfValeur(500);
    process.env.FC_RELANCE_ALLOWLIST_ONLY = "yes";
  }, 120_000);

  afterAll(() => {
    delete process.env.FC_RELANCE_ALLOWLIST_ONLY;
  });

  it("s'arrête avant le moindre appel API quand aucun refus n'est autorisé", async () => {
    const before = stack.apiCallCount();

    await stack.enqueueRelanceAndWait(inputFor(aucunAutoriseSub), aucunAutoriseSub);

    expect(stack.apiCallCount()).toBe(before);
    expect((await rowsFor(aucunAutoriseSub)).every((r) => r.verdict === "not_eligible")).toBe(true);

    const events = await relanceEventsFor(aucunAutoriseSub);
    expect(events).toHaveLength(1);
    expect(events[0].response_payload.raison).toBe("relance_non_autorisee");
  });

  it("ne relève que les lignes autorisées", async () => {
    await stack.enqueueRelanceAndWait(inputFor(unAutoriseSub), unAutoriseSub);

    const byName = (rs: Record<string, any>[], name: string) =>
      rs.find((r) => r.enfant_identite?.given_name === name);
    const rs = await rowsFor(unAutoriseSub);

    expect(byName(rs, "Milieu")?.verdict).toBe("eligible_pending");
    // Couvert par le nouveau quotient, mais hors de la liste de test.
    expect(byName(rs, "Cadet")?.verdict).toBe("not_eligible");

    const nonAutorisees = (await relanceEventsFor(unAutoriseSub)).filter(
      (e) => e.response_payload.raison === "relance_non_autorisee",
    );
    expect(nonAutorisees).toHaveLength(4);
  });
});
