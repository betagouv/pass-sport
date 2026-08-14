# Data flow

Notebook paths below are relative to [partners/](partners/), except ⑨ which is relative to
this folder. Each partner owns a subfolder holding its notebooks, its extracted library, its
tests and its data files.

What the partners routed through qf-batch have in common — the eligibility windows, the
quotient-familial threshold, the deduplication key, the JSON output schema and the route
selection — lives once in [partners/partners_lib.py](partners/partners_lib.py) (tests in
[partners/test_partners_lib.py](partners/test_partners_lib.py)). A partner's own module only
holds what its file looks like: its raw column names, its date and genre encodings, its
quirks.

Step ③ works the same way: the campaign's default columns and the code generation live in
[partners/generate_codes_lib.py](partners/generate_codes_lib.py), on top of the year-agnostic
drawing and bookkeeping of [utils/codes_utils.py](../utils/codes_utils.py).

Steps ⑩ ③ ⑪ are also driven unattended, by
[partners/franceconnect/run_fc_pipeline.sh](partners/franceconnect/run_fc_pipeline.sh) — the
only source whose input is a live table rather than a frozen export, hence a cron rather than
a one-shot notebook run. It calls the very same functions the notebooks do.

## Running a notebook without a graphical interface

The processing machine is headless, so the notebooks are executed with `nbconvert` rather
than opened. They are **not** converted to `.py`: the business logic already lives in the
tested `*_lib.py` modules, and what remains in the `.ipynb` is the run-by-run reporting —
rejected rows, padded INSEE codes, birth-country labels without a COG match — which
`nbconvert` preserves and a conversion would discard.

```bash
cd data/2026/partners
nb() { ../../.venv/bin/jupyter nbconvert --to notebook --execute --inplace \
         --ExecutePreprocessor.timeout=-1 "$1"; }

nb msa/clean_msa_1_before_qf_batch.ipynb   # ②a writes the qf-batch input + the parquet
systemctl start pass-sport-qf-batch@msa    #    the API batch, detached (up to a week)
nb msa/clean_msa_2_after_qf_batch.ipynb    # ②b joins the verdict, writes DB_MSA_EXPORT_2026
```

`--inplace` makes the executed notebook *be* the run's report, read exactly as if it had run
on screen: `data/.gitignore` does not cover `.ipynb`, so `git diff` shows the counts and
`git checkout` puts the notebook back when you would rather not keep them.
`--ExecutePreprocessor.timeout=-1` lifts the 30 s per-cell default, which would otherwise kill
the read of a several-hundred-thousand-row export. For a report to `scp` back, `--to html` on
the already-executed notebook (so without `--execute`).

Two prerequisites, both handled by [deploy/ansible/](../../deploy/ansible/): the `data/.venv`
virtualenv, and its Jupyter kernel registered under the name `python3` — the name all 13
notebooks declare, without which `nbconvert` fails on `No such kernel named python3`.

```mermaid
flowchart TB
    classDef rawFile fill:#d4e6f1,stroke:#2980b9,color:#000
    classDef cleanedFile fill:#d5f5e3,stroke:#27ae60,color:#000
    classDef finalFile fill:#a9dfbf,stroke:#1e8449,color:#000
    classDef campaignFile fill:#fdebd0,stroke:#e67e22,color:#000
    classDef sharedInput fill:#e8daef,stroke:#8e44ad,color:#000

    EXISTING_CODES[("Existing codes\n2026")]:::sharedInput

    CNAF_RAW[("CNAF_PATHFILE_2026\nCSV / ASCII / sep=;")]:::rawFile
    MSA_RAW[("MSA_PATHFILE_2026\nCSV / utf-8-sig / sep=;")]:::rawFile
    CNOUS_RAWS[("CNOUS raw files\nCSV / UTF-8 / sep=,")]:::rawFile
    FSS_RAW[("FSS_PATHFILE_2026\nCSV / UTF-8 / sep=;")]:::rawFile

    subgraph CNAF_NB1["①a cnaf/clean_cnaf_1_before_qf_batch.ipynb"]
        c1["Load CSV · drop last row\nstrip whitespace\nextract postal + commune from ADRLIG5"]
        c2["Map columns → PSP schema · organisme='CAF'\nsituation = CNAF's own ORIGINESELECTION\n(AAH/ARS→jeune/AEEH), no more DOB+name guessing"]
        c2b["Dedup ARS rows by allocataire (1 quotient_familial\ncall per household, not per child) → qf-batch input CSV"]
        c3["Remove rows missing nom/prenom/dob/genre\nage floor 1996 · fix phone numbers · drop duplicates"]
        c4["Serialize allocataire + adresse_allocataire → JSON"]
        c1-->c2-->c2b-->c3-->c4
    end

    subgraph CNAF_NB2["①b cnaf/clean_cnaf_2_after_qf_batch.ipynb"]
        c4b["Join qf-batch verdict back onto every child\nof its allocataire (by matricule + code_organisme)"]
        c5{"Split\nby route"}
        c4b-->c5
    end

    CNAF_RAW --> c1
    c2b -->|"CSV"| QF_BATCH[("qf-batch.ts\ndetached process, up to a week")]:::rawFile
    QF_BATCH -->|"CSV: qf_value/qf_status/qf_error"| c4b
    c4 -->|"CNAF_INTERMEDIATE_PATHFILE_2026\nParquet: cleaned benef rows waiting for the verdict"| c4b

    c5 -->|"QF 6-17 + AAH 16-30 + AEEH 6-19"| DB_CNAF[("DB_CNAF_EXPORT_2026\nCSV")]:::cleanedFile

    subgraph MSA_NB1["②a msa/clean_msa_1_before_qf_batch.ipynb"]
        m1["Load CSV · strip whitespace\nmap 29 columns → PSP schema · organisme='MSA'\ngenre 1/2→M/F · dates %Y%m%d · pad INSEE & postal codes\nsituation = MSA's own prestation (ARS→jeune, AEH→AEEH)"]
        m2b["Dedup ARS rows by allocataire (1 quotient_familial\ncall per household, not per child) → qf-batch input CSV\nnom_usage = nom_destinataire, except under guardianship"]
        m3["Remove rows missing nom/prenom/dob/genre\nage floor 1996 · fix phone numbers · drop duplicates"]
        m4["Serialize allocataire + adresse_allocataire → JSON\n(+ birth details and nom_adresse_postale, MSA only)"]
        m1-->m2b-->m3-->m4
    end

    subgraph MSA_NB2["②b msa/clean_msa_2_after_qf_batch.ipynb"]
        m4b["Join qf-batch verdict back onto every child\nof its allocataire (by matricule + code_organisme)"]
        m5{"Split\nby route"}
        m4b-->m5
    end

    MSA_RAW --> m1
    m2b -->|"CSV"| QF_BATCH
    QF_BATCH -->|"CSV: qf_value/qf_status/qf_error"| m4b
    m4 -->|"MSA_INTERMEDIATE_PATHFILE_2026\nParquet: cleaned benef rows waiting for the verdict"| m4b

    m5 -->|"QF 6-17 + AAH 16-30 + AEEH 6-19"| DB_MSA[("DB_MSA_EXPORT_2026\nCSV")]:::cleanedFile

    subgraph FC_NB["⑩ franceconnect/  ·  pas un fichier partenaire : une requête sur la prod"]
        fc0["export_eligible_pending.sql (tunnel Scalingo)\nverdict='eligible_pending' · dernier run par sub\nexclut ceux déjà servis (eligible_pending_lca)"]
        fc1["clean_franceconnect.ipynb\nsituation redéduite des payloads API Particulier\ngenre des enfants retrouvé dans la réponse QF"]
        fc2["Serialize allocataire + adresse_allocataire → JSON\ndédup sur l'identité seule (un enfant, deux parents)"]
        fc0-->fc1-->fc2
    end

    ELIG_RESULTS[("eligibility_results\nPostgres Scalingo (prod)")]:::rawFile
    ELIG_RESULTS --> fc0
    fc2 -->|"DB_FC_EXPORT_2026\nCSV + eligibility_result_id"| DB_FC[("DB_FC_EXPORT_2026\nCSV")]:::cleanedFile

    subgraph FC_WB["⑪ franceconnect/writeback_codes.ipynb + writeback_verdict.sql"]
        wb1["Découpe le CSV daté en deux :\nfc_2026_writeback.csv (id + code)\net le CSV de prod, sans colonne technique"]
        wb2["UPDATE eligibility_results\nverdict → 'eligible_pending_lca' · pass_sport_code"]
        wb3["check_writeback.sql : 0 bénéficiaire du passage\nencore en 'eligible_pending' — sinon rien n'est déposé"]
        wb1-->wb2-->wb3
    end

    subgraph MERGE_NB["③ generate_new_codes.ipynb  ·  run once per cleaned file"]
        mg1["Load ONE cleaned file (SOURCE = CNAF | MSA | CNOUS | FC)\nexercice_id=5 · timestamps\nzrr/qpv/a_valider/refuser = False"]
        mg2["Generate unique id_psp codes\nformat: YY-XXXX-XXXX\nseeded with the existing codes"]
        mg3["Write YYYY-MM-DD-source-with-codes.csv\nrewrite the existing codes file with the new ones"]
        mg1-->mg2-->mg3
    end

    DB_CNAF --> mg1
    DB_MSA --> mg1
    CNOUS_CLEANED --> mg1
    DB_FC --> mg1
    EXISTING_CODES -.->|"seed"| mg2

    mg3 --> FINAL_DB[("one file per source\nCSV + id_psp")]:::finalFile
    mg3 -.->|"track used codes"| EXISTING_CODES

    %% La boucle de retour, propre à la source FC : sans elle le prochain export reprendrait
    %% les mêmes bénéficiaires et leur fabriquerait un second code.
    mg3 -->|"FC uniquement"| wb1
    wb2 -.->|"marque les servis"| ELIG_RESULTS
    wb3 -->|"dépôt en dernier, une fois le marquage vérifié"| FC_DROP[("FC_PROD_DROP_DIR\n/nfs/postgresql")]:::finalFile

    subgraph CNOUS_NB["④ cnous/clean_cnous.ipynb  ·  run once per wave"]
        cn1["Load CSV · dedup on allocataire-matricule (INE)\nclean + uppercase names\norganisme='cnous' · situation='boursier'"]
        cn2["Parse dates · filter DOB 1997-2026\nremove invalid rows · add 4h to birthdates\nserialize allocataire + adresse_allocataire → JSON\nadd default DB columns · dedup on email"]
        cn1-->cn2
    end

    CNOUS_RAWS --> cn1
    cn2 --> CNOUS_CLEANED[("CNOUS cleaned files\nCSV per wave  —  no id_psp")]:::cleanedFile

    subgraph DEDUP_NB["⑤ cnous/deduplication_cnous.ipynb"]
        dd1["Unwrap allocataire JSON\nexpose matricule / INE field"]
        dd2["Right join on allocataire-matricule\nkeep wave 2 rows NOT in wave 1"]
        dd3["Dedup on nom + prenom + date_naissance\nGenerate id_psp codes\nexcluding existing codes"]
        dd1-->dd2-->dd3
    end

    CNOUS_CLEANED -->|"wave 1"| dd1
    CNOUS_CLEANED -->|"wave 2"| dd1
    EXISTING_CODES -.->|"seed"| dd3
    dd3 --> CNOUS_OUT[("CNOUS_2_OUTPUT\nCSV + id_psp")]:::finalFile

    subgraph DEDUP_OCC_NB["⑥ cnous/deduplication_cnous_for_occitanie.ipynb"]
        do1["Unwrap allocataire JSON\nexpose matricule / INE field"]
        do2["Right join on allocataire-matricule\nkeep Occitanie rows NOT in wave 1"]
        do3["Dedup on nom + prenom + date_naissance\nGenerate id_psp codes\nexcluding existing codes"]
        do1-->do2-->do3
    end

    CNOUS_CLEANED -->|"wave 1 merged"| do1
    CNOUS_CLEANED -->|"Occitanie"| do1
    EXISTING_CODES -.->|"seed"| do3
    do3 --> CNOUS_OCC_OUT[("CNOUS_OCCITANIE_OUTPUT\nCSV + id_psp")]:::finalFile

    subgraph FSS_NB["⑦ cnous/fss/clean_fss.ipynb"]
        f1["Load CSV · clean + uppercase names\nparse dates · organisme='cnous'\nsituation='boursier'"]
        f2["Filter DOB 1997-2026 · remove invalid rows\ndedup on email · add 4h to birthdates\nserialize allocataire + adresse_allocataire → JSON"]
        f3["Generate id_psp codes\nexcluding existing codes\nadd default DB columns"]
        f1-->f2-->f3
    end

    FSS_RAW --> f1
    EXISTING_CODES -.->|"seed"| f3
    f3 --> DB_FSS[("DB_FSS_EXPORT_2026\nCSV + id_psp")]:::finalFile

    subgraph PARQUET_NB["⑧ csv_to_parquet.ipynb"]
        p1["Read CSV · define PyArrow schema\n(all columns as string)\nWrite Parquet"]
    end

    FINAL_DB --> p1
    p1 --> BENEF_PARQUET[("BENEF_2026\nParquet")]:::finalFile

    subgraph EMAIL_NB["⑨ linkmobility/1_email_campaign.ipynb"]
        e1["Load Parquet · unwrap allocataire JSON\nfilter: keep rows with email only"]
        e2["Map + rename columns\nformat names & birth date text\ngenerate AES-CBC encrypted QR code URL per row"]
        e3{"Split by\nallocataire vs benef"}
        e1-->e2-->e3
    end

    BENEF_PARQUET --> e1
    e3 -->|"allocataire = benef"| CAMP_B[("Campaign CSV B\ndirect beneficiaries")]:::campaignFile
    e3 -->|"allocataire ≠ benef"| CAMP_BA[("Campaign CSV B+A\nindirect beneficiaries")]:::campaignFile

```
