import { describe, expect, it } from "vitest";
import { parseRecipients, recipientVariables } from "../../src/scripts/send-partner-code-emails";

const HEADER = "id;kind;code;email;nom;prenom;date_naissance;allocataire_nom;allocataire_prenom";

const csv = (...lines: string[]): string => [HEADER, ...lines].join("\n") + "\n";

const DIRECT = "26-ABCD-EFGH;code_direct_aah;26-ABCD-EFGH;tozal@example.org;MERVIK;ÉLYRA;2001-12-14;MERVIK;ÉLYRA";
const INDIRECT =
  "26-JKLM-NPQR;code_indirect;26-JKLM-NPQR;vexor@example.org;KARSYM;JOVUNE-ITH;2011-03-06;IVORVIRNOVA;SEZENS";

describe("parseRecipients", () => {
  it("reads both kinds, a sibling sharing an address included", () => {
    const sibling = INDIRECT.replaceAll("26-JKLM-NPQR", "26-STUV-WXYZ").replace("JOVUNE-ITH", "QUOITH");
    const rows = parseRecipients(`﻿${csv(DIRECT, INDIRECT, sibling)}`);

    expect(rows.map((row) => [row.id, row.kind, row.email])).toEqual([
      ["26-ABCD-EFGH", "code_direct_aah", "tozal@example.org"],
      ["26-JKLM-NPQR", "code_indirect", "vexor@example.org"],
      ["26-STUV-WXYZ", "code_indirect", "vexor@example.org"],
    ]);
  });

  it("refuses any other header", () => {
    expect(() =>
      parseRecipients("id;code;email;nom;prenom;date_naissance\nid-1;C;a@example.org;N;P;2006-08-07\n"),
    ).toThrow(/en-tête .* inattendu/);
  });

  it("refuses an unknown kind", () => {
    expect(() => parseRecipients(csv(DIRECT.replace("code_direct_aah", "code_direct_boursier")))).toThrow(
      /kind "code_direct_boursier" inconnu/,
    );
  });

  it("requires the allocataire names on code_indirect only", () => {
    expect(() => parseRecipients(csv(INDIRECT.replace(";IVORVIRNOVA;", ";;")))).toThrow(/allocataire_nom/);
    expect(parseRecipients(csv(DIRECT.replace(/;MERVIK;ÉLYRA$/, ";;")))).toHaveLength(1);
  });

  it("refuses a non-ISO birthdate, an empty code and a duplicated id", () => {
    expect(() => parseRecipients(csv(DIRECT.replace("2001-12-14", "14/12/2001")))).toThrow(/AAAA-MM-JJ/);
    expect(() => parseRecipients(csv(DIRECT.replace(";26-ABCD-EFGH;tozal", ";;tozal")))).toThrow(/code/);
    expect(() => parseRecipients(csv(DIRECT, DIRECT))).toThrow(/en double/);
  });
});

describe("recipientVariables", () => {
  it("sends the code_direct_aah merge fields, without the allocataire", () => {
    const [row] = parseRecipients(csv(DIRECT));
    expect(recipientVariables(row)).toEqual({
      kind: "code_direct_aah",
      BENEFICIAIRE_PRENOM: "Élyra",
      BENEFICIAIRE_NOM: "Mervik",
      DATE_NAISSANCE_BENEFICIAIRE: "14/12/2001",
      CODE: "26-ABCD-EFGH",
    });
  });

  it("names the allocataire on code_indirect", () => {
    const [row] = parseRecipients(csv(INDIRECT));
    expect(recipientVariables(row)).toEqual({
      kind: "code_indirect",
      BENEFICIAIRE_PRENOM: "Jovune-ith",
      BENEFICIAIRE_NOM: "Karsym",
      DATE_NAISSANCE_BENEFICIAIRE: "06/03/2011",
      CODE: "26-JKLM-NPQR",
      ALLOCATAIRE_PRENOM: "Sezens",
      ALLOCATAIRE_NOM: "Ivorvirnova",
    });
  });
});
