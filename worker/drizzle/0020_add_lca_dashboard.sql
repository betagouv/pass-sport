CREATE TABLE "lca_tableaux_de_bord" (
	"tableau" text NOT NULL,
	"jour" date NOT NULL,
	"rang" integer NOT NULL,
	"code" text,
	"libelle" text NOT NULL,
	"eligibles" integer,
	"codes_actives" integer NOT NULL,
	"codes_actives_du_jour" integer NOT NULL,
	"taux_recours" numeric(5, 2),
	"part_eligibles" numeric(5, 2),
	"part_actives" numeric(5, 2),
	"extrait_le" timestamp with time zone NOT NULL,
	CONSTRAINT "lca_tableaux_de_bord_tableau_jour_libelle_pk" PRIMARY KEY("tableau","jour","libelle"),
	CONSTRAINT "lca_tableaux_de_bord_tableau_check" CHECK ("lca_tableaux_de_bord"."tableau" in ('genre', 'situation', 'organisme', 'region', 'departement'))
);
--> statement-breakpoint
CREATE VIEW "public"."lca_tableaux_de_bord_publies" AS (select "tableau", "jour", "rang", "code", "libelle", "eligibles", "codes_actives", "codes_actives_du_jour", "taux_recours", "part_eligibles", "part_actives", "extrait_le" from "lca_tableaux_de_bord");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.lca_tableaux_de_bord_publies TO site_readonly;
  END IF;
END
$$;
