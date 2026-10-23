import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// Le dossier Démarche Numérique pré-rempli d'un foyer refusé : créé une fois, relu ensuite,
// recréé seulement quand DN ne le liste plus.
//
// Les quatre enfants du faux client, à la date de référence 2026-12-31 :
//   Adulte 2005 -> 21 ans, hors des deux fenêtres : jamais dans le dossier
//   Aine   2008 -> 18 ans, fenêtre AEEH seulement
//   Milieu 2009 -> 17 ans, fenêtre QF
//   Cadet  2012 -> 14 ans, fenêtre QF

let stack: Stack;

const identity = (sub: string, birthdate = "1985-04-02") => ({
  sub,
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate,
  gender: "female" as const,
  birthplace: "75056",
  birthcountry: "99100",
  email: `${sub}@example.test`,
});

const dnIdentity = (sub: string, birthdate?: string) => {
  const { family_name, given_name, gender, birthdate: born } = identity(sub, birthdate);
  return { sub, family_name, given_name, birthdate: born, gender };
};

const runChain = (sub: string, birthdate?: string) =>
  stack.enqueueAndWait({ identity: identity(sub, birthdate), isFranceConnected: true }, sub);

const dossiers = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from fc_dn_dossiers where allocataire_fc_sub = $1 order by created_at",
      [sub],
    )
  ).rows;

const dnHistory = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from eligibility_history where allocataire_fc_sub = $1 and action like 'dn.%' order by created_at, id",
      [sub],
    )
  ).rows;

// Requests the fake DN received since `since`.
const requestsSince = (since: number) => stack.dnRequests().slice(since);

const refusedHousehold = () => {
  stack.setAahBeneficiaire(false);
  stack.setCrousBoursier(false);
  stack.setAeehBeneficiaire(false);
  stack.setQfValeur(1000);
  stack.setQfChildless(false);
  stack.setQfNotFound(false);
};

const child = (prenom: string, naissance: string, genre: string) => ({
  champ_E_NOM: "QUISTANE",
  champ_E_PRENOM: prenom,
  champ_E_NAISSANCE: naissance,
  champ_E_GENRE: genre,
  champ_E_AEEH: "false",
});

beforeAll(async () => {
  stack = await startStack();
  stack.setChildrenLastname("QUISTANE");
});

afterAll(async () => {
  await stack?.close();
});

beforeEach(() => refusedHousehold());

describe("un foyer refusé", () => {
  const sub = "fc-sub-dn-refuse";

  beforeAll(async () => {
    refusedHousehold();
    await runChain(sub);
  });

  it("reçoit un dossier pré-rempli de FranceConnect et des réponses d'API Particulier", async () => {
    const since = stack.dnRequests().length;

    const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub));

    expect(outcome).toEqual({ outcome: "created", dossierNumber: 9001, state: "prefilled" });

    const requests = requestsSince(since);
    expect(requests.map((r) => r.method)).toEqual(["POST"]);
    expect(requests[0].contentType).toBe("application/json");
    expect(requests[0].body).toEqual({
      identite_nom: "OSTRENYA",
      identite_prenom: "Velmorak",
      identite_genre: "Mme",
      champ_GENRE: "Mme",
      champ_NAISSANCE: "1985-04-02",
      champ_CAISSE: "CAF",
      champ_ENFANTS: [
        child("Aine", "2008-01-01", "Masculin"),
        child("Milieu", "2009-01-01", "Féminin"),
        child("Cadet", "2012-01-01", "Féminin"),
      ],
      champ_ENFANTS_OUI: "true",
      champ_FOYER: "false",
    });

    const [row] = await dossiers(sub);
    expect(row).toMatchObject({
      demarche_number: 4242,
      dossier_number: 9001,
      prefill_token: "tok-1",
      state: "prefilled",
    });

    const view = await stack.pool.query("select * from fc_dn_dossier_by_sub where sub = $1", [sub]);
    expect(view.rows).toEqual([
      expect.objectContaining({ dossier_number: 9001, state: "prefilled", dossier_url: row.dossier_url }),
    ]);

    const [prefill] = await dnHistory(sub);
    expect(prefill).toMatchObject({
      actor: "demarche_numerique",
      action: "dn.dossier_prefill",
      status: "success",
      http_status: 201,
      body_payload: requests[0].body,
      response_payload: expect.objectContaining({ dossier_number: 9001 }),
    });
  });

  it("retrouve le même dossier au clic suivant, sans en créer d'autre", async () => {
    stack.setDnDossierState(9001, "en_construction");
    const since = stack.dnRequests().length;

    const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub));

    expect(outcome).toEqual({ outcome: "refreshed", dossierNumber: 9001, state: "en_construction" });
    expect(requestsSince(since).map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /api/public/v1/demarches/4242/dossiers?prefill_token=tok-1",
    ]);

    const rows = await dossiers(sub);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("en_construction");
    expect(rows[0].submitted_at).not.toBeNull();

    const etat = (await dnHistory(sub)).find((e) => e.action === "dn.dossier_etat");
    expect(etat?.response_payload).toEqual({
      dossier_number: 9001,
      etat_avant: "prefilled",
      etat_apres: "en_construction",
    });
  });

  it("en recrée un quand DN ne liste plus l'ancien", async () => {
    stack.setDnDossierState(9001, null);
    const since = stack.dnRequests().length;

    const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub));

    expect(outcome).toMatchObject({ outcome: "recreated", state: "prefilled" });
    expect(requestsSince(since).map((r) => r.method)).toEqual(["GET", "POST"]);

    const rows = await dossiers(sub);
    expect(rows.map((r) => r.state)).toEqual(["gone", "prefilled"]);
  });
});

describe("Démarche Numérique en difficulté", () => {
  it("réessaie après un 503 et ne garde qu'un dossier", async () => {
    const sub = "fc-sub-dn-503";
    await runChain(sub);
    stack.failNextDnRequests(503);
    const since = stack.dnRequests().length;

    const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub));

    expect(outcome.outcome).toBe("created");
    expect(requestsSince(since).map((r) => r.method)).toEqual(["POST", "POST"]);
    expect(await dossiers(sub)).toHaveLength(1);
  });

  it("abandonne dès la première tentative sur un 400", async () => {
    const sub = "fc-sub-dn-400";
    await runChain(sub);
    stack.failNextDnRequests(400);

    const { attemptsMade } = await stack.enqueueDnDossierAndWaitFailure(dnIdentity(sub));

    expect(attemptsMade).toBe(1);
    expect(await dossiers(sub)).toHaveLength(0);
    expect(await dnHistory(sub)).toEqual([
      expect.objectContaining({
        action: "dn.dossier_prefill",
        status: "invalid_request",
        http_status: 400,
        error: "Erreur simulée",
      }),
    ]);
  });

  it("enregistre au nouvel essai le dossier déjà créé, sans le recréer", async () => {
    const sub = "fc-sub-dn-insert";
    await runChain(sub);
    // Sequences are not rolled back: the first INSERT fails, the next one goes through.
    await stack.pool.query(`
      create sequence dn_fail_once;
      create function dn_fail_once() returns trigger as $$
      begin
        if nextval('dn_fail_once') = 1 then raise exception 'insert refusé'; end if;
        return new;
      end $$ language plpgsql;
      create trigger dn_fail_once before insert on fc_dn_dossiers
        for each row execute function dn_fail_once();
    `);
    const since = stack.dnRequests().length;

    try {
      const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub));

      expect(outcome.outcome).toBe("created");
      expect(requestsSince(since).map((r) => r.method)).toEqual(["POST"]);
      expect(await dossiers(sub)).toHaveLength(1);
    } finally {
      await stack.pool.query(`
        drop trigger dn_fail_once on fc_dn_dossiers;
        drop function dn_fail_once();
        drop sequence dn_fail_once;
      `);
    }
  });
});

describe("rien à contester", () => {
  it("n'appelle pas DN pour un foyer entièrement éligible", async () => {
    const sub = "fc-sub-dn-eligible";
    // Boursier dans la fenêtre CROUS et sans enfant : une seule ligne, éligible.
    stack.setCrousBoursier(true);
    stack.setQfChildless(true);
    await runChain(sub, "2004-05-15");
    const since = stack.dnRequests().length;

    const outcome = await stack.enqueueDnDossierAndWait(dnIdentity(sub, "2004-05-15"));

    expect(outcome).toEqual({ outcome: "skipped", raison: "aucun_refus" });
    expect(requestsSince(since)).toEqual([]);
    expect(await dossiers(sub)).toHaveLength(0);
  });
});

describe("sans quotient familial", () => {
  it("ne pré-remplit que l'identité du demandeur", async () => {
    const sub = "fc-sub-dn-qf-404";
    stack.setQfNotFound(true);
    await runChain(sub);
    const since = stack.dnRequests().length;

    await stack.enqueueDnDossierAndWait(dnIdentity(sub));

    expect(requestsSince(since)[0].body).toEqual({
      identite_nom: "OSTRENYA",
      identite_prenom: "Velmorak",
      identite_genre: "Mme",
      champ_GENRE: "Mme",
      champ_NAISSANCE: "1985-04-02",
    });
  });
});

// Last: covers every dossier created, refreshed or refused above.
describe("le journal", () => {
  it("ne porte jamais le lien ni son jeton", async () => {
    const { rows } = await stack.pool.query(
      "select count(*)::int as n from eligibility_history where concat(body_payload::text, response_payload::text, error) ~ '(tok-|prefill_token|commencer)'",
    );

    expect(rows[0].n).toBe(0);
  });
});
