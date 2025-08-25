import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export function AccordionsBecomePartner() {
  return (
    <>
      <Accordion label="J’étais partenaire du dispositif l’année dernière">
        <p>Vous avez juste à mettre à jour sur votre Compte Asso avec :</p>
        <ul className="fr-pl-4w">
          <li>
            Votre justificatif d’éligibilité dans la section &ldquo;Affiliations et adhérents
            personnes morales&rdquo; ;
          </li>
          <li>Vos coordonnées bancaires.</li>
        </ul>
        <p>Votre justificatif d’éligibilité peut être l’un des trois ci-dessous :</p>
        <ul className="fr-pl-4w">
          <li>
            Affilée : attestation d&apos;affiliation à une fédération sportive agréée par le
            Ministère des Sports, de la Jeunesse et de la Vie associative ;
          </li>
          <li>Association : agrément JEP ou Sport valide ;</li>
          <li>
            Structures privées (Loisirs Sportifs Marchands) :{' '}
            <Link
              className="fr-link"
              href="/assets/partenaires/charte-lsm-2025-non-adherents.pdf"
              aria-label="Ouvrir une nouvelle fenêtre pour visualiser la charte LSM 2025 pour les non adhérents"
              target="_blank"
            >
              Charte d&apos;engagement 2025
            </Link>
            .
          </li>
        </ul>
      </Accordion>

      <Accordion label="Vous êtes une structure affiliée à l’une des 120 fédérations sportives et 22 groupements nationaux agréés par le ministère des Sports, de la Jeunesse et de la Vie associative"></Accordion>
      <Accordion label="Je suis une structure agrée Sport ou Jeunesse Éducation Populaire et propose une activité physique et sportive tout au long de l’année"></Accordion>
      <Accordion label="Je suis un Loisir Sportif Marchand ayant signé la charte d’engagement proposée par le ministère des Sports, de la Jeunesse et de la Vie associative"></Accordion>
      <Accordion label="Je ne sais pas à quel type de structure j’appartiens"></Accordion>
      <Accordion label="Je n’appartiens à aucune de ces structures"></Accordion>
    </>
  );
}
