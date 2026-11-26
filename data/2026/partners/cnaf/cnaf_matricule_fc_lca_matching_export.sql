-- Input of cnaf_matricule_fc_lca_matching.py: LCA beneficiaries of exercice 5, CAF, without matricule,
-- enrolled in a federation. Run on the production LCA database:
--   psql "<LCA connection>" -f cnaf_matricule_fc_lca_matching_export.sql > lca_inscrits_sans_matricule.tsv
-- The allocataire_courriel column is only used with --avec-courriel and can be removed otherwise.
copy (
  select
    b.id                                             as beneficiaire_id,
    b.situation,
    b.genre,
    b.nom,
    b.prenom,
    b.date_naissance::date                           as date_naissance,
    b.allocataire ->> 'qualite'                      as allocataire_qualite,
    b.allocataire ->> 'nom'                          as allocataire_nom,
    b.allocataire ->> 'prenom'                       as allocataire_prenom,
    b.allocataire ->> 'date_naissance'               as allocataire_date_naissance,
    b.allocataire ->> 'code_insee_commune_naissance' as allocataire_code_insee_naissance,
    b.allocataire ->> 'courriel'                     as allocataire_courriel
  from beneficiaires b
  where b.exercice_id = 5
    and b.organisme = 'CAF'
    and nullif(trim(b.allocataire ->> 'matricule'), '') is null
    and exists (
      select 1 from inscriptions i
      where i.beneficiaire_id = b.id and i.exercice_id = 5
    )
) to stdout with (format csv, header, delimiter E'\t');
