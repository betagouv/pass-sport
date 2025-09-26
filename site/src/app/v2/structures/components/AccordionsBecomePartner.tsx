'use client';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsBecomePartner() {
  return (
    <>
      <Accordion
        label="J’étais partenaire du dispositif l’année dernière"
        onExpandedChange={() => {}}
      >
        <p>
          Pour rester partenaire du dispositif cette année, vous avez simplement à mettre à jour
          votre{' '}
          <Link
            href="https://lecompteasso.associations.gouv.fr/"
            target="_blank"
            className="fr-link"
            title="Lien vers Le Compte Asso (nouvelle fenêtre)"
          >
            Compte Asso
          </Link>{' '}
          avec :
        </p>
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
            Structure affilée : attestation d&apos;affiliation à une fédération sportive agréée par
            le Ministère chargé des Sports ;
          </li>
          <li>Association : agrément JEP ou Sport valide ;</li>
          <li>
            Structure à but lucratif (Loisirs Sportifs Marchands) : charte d&apos;engagement 2025.
          </li>
        </ul>

        <DownloadLink
          details="PDF ~ 163 kB"
          label="Télécharger la charte d'engagement 2025"
          href="/assets/partenaires/charte-lsm-2025.pdf"
        />

        <p className="fr-mb-1w">
          Pour vous aider dans vos démarches, vous pouvez téléchargez notre notice d’aide :{' '}
        </p>
        <DownloadLink
          details="PDF ~ 252 kB"
          label="Télécharger la notice pass Sport 2025"
          href="/assets/partenaires/notice-pass-sport-2025.pdf"
        />
        <DownloadLink
          details="PDF ~ 264 kB"
          label="Télécharger la notice pass Sport 2025 dédiée aux Loisirs Sportifs Marchands"
          href="/assets/partenaires/notice-lsm-2025.pdf"
        />
      </Accordion>

      <Accordion
        label="Je suis une structure affiliée à l’une des fédérations sportives agréées par le ministère chargé des Sports"
        onExpandedChange={() => {}}
      >
        <p className="fr-mb-2w">
          Votre structure doit être affiliée, pour la saison 2025-2026, à l&apos;une des{' '}
          <Link
            href="https://www.sports.gouv.fr/les-118-federations-sportives-et-22-groupements-nationaux-530"
            title="Aller vers la liste des fédérations sportives agréées par le ministère chargé des Sports - Nouvelle fenêtre"
            target="_blank"
            className="fr-link"
          >
            fédérations sportives agréées
          </Link>{' '}
          par le ministère chargé des Sports.
        </p>

        <p className="fr-mb-2w">
          Si c&apos;est le cas, vous devrez vous créer un compte sur{' '}
          <Link
            href="https://lecompteasso.associations.gouv.fr/"
            target="_blank"
            className="fr-link"
            title="Lien vers Le Compte Asso (nouvelle fenêtre)"
          >
            Le Compte Asso
          </Link>{' '}
          ou le mettre à jour.
        </p>

        <p>
          Un{' '}
          <Link
            href="https://view.genially.com/68ca5c87e161eb800feb72cf/guide-vclubs-affiliees-a-une-fede-agreee-ministere-charge-des-sports"
            className="fr-link"
            title="Consultez le tutorial - Nouvelle fenêtre"
            target="_blank"
          >
            tutoriel
          </Link>{' '}
          est disponible pour vous accompagner.
        </p>
      </Accordion>
      <Accordion
        label="Je suis une association ayant un agrément Sport ou Jeunesse Education Populaire et je propose une activité sportive tout au long de l'année"
        onExpandedChange={() => {}}
      >
        <p className="fr-mb-2w">
          Votre association doit avoir un agrément Sport ou Jeunesse Éducation Populaire (JEP) en
          cours de validité délivré par le préfet du département et proposer une activité physique
          et sportive tout au long de l&apos;année.
        </p>

        <ul className="fr-pl-4w">
          <li>
            Pour être valable, l’agrément Sport doit avoir une date d&apos;émission de 2016 ou plus
            récente ;
          </li>
          <li>
            Pour être valable, l’agrément JEP doit avoir une date d&apos;émission de 2020 ou plus
            récente.
          </li>
        </ul>

        <p className="fr-mb-2w">
          Si c&apos;est le cas, vous devrez vous créer un compte sur{' '}
          <Link
            href="https://lecompteasso.associations.gouv.fr/"
            target="_blank"
            title="Lien vers Le Compte Asso (nouvelle fenêtre)"
            className="fr-link"
          >
            Le Compte Asso
          </Link>{' '}
          ou le mettre à jour.
        </p>

        <p>
          Un{' '}
          <Link
            href="https://view.genially.com/68c96700f88999c4be85cef4/guide-assos-avec-un-agrement-jep-ou-sport"
            title="Consultez le tutorial - Nouvelle fenêtre"
            className="fr-link"
            target="_blank"
          >
            tutoriel
          </Link>{' '}
          est disponible pour vous accompagner.
        </p>
      </Accordion>
      <Accordion
        label="Je suis une structure à but lucratif du secteur Loisirs Sportifs Marchands"
        onExpandedChange={() => {}}
      >
        <p className="fr-mb-2w">Les responsables de structure s&apos;engagent à :</p>
        <ol className="fr-pl-4w fr-list fr-mb-2w">
          <li>
            Signer la charte d&apos;engagement 2025 proposée par le ministère chargé des Sports.
            Cette charte engage les entités à proposer ou organiser des activités sportives, de
            loisir ou non, à but lucratif, relevant de certains codes de la nomenclature des
            activités françaises (NAF) :
            <ul>
              <li>9311Z : gestion d&apos;installations sportives 9312Z ;</li>
              <li>9312Z : activités des clubs de sports ;</li>
              <li>9329Z : autres activités récréatives et de loisirs ;</li>
              <li>9313Z : activités des centres de culture physique ;</li>
              <li>
                8551Z : enseignement de disciplines sportives et d&apos;activités de loisirs ;
              </li>
              <li>6420Z : activités des sociétés holding.</li>
            </ul>
            <DownloadLink
              details="PDF ~ 163 kB"
              label="Télécharger la charte d'engagement 2025"
              href="/assets/partenaires/charte-lsm-2025.pdf"
            />
          </li>
          <li>
            Proposer une offre durable : minimum de 3 mois pour un abonnement et au moins 10 séances
            pour des « tickets ». Cette offre, à tarif réduit, doit être de qualité équivalente à
            celle des autres adhérents ne bénéficiant pas de réduction. Les offres commerciales sont
            encouragées (par exemple : 12 séances au prix de 10). Seuls les abonnements souscrits du
            1er juin au 31 décembre 2025 sont éligibles. Le pass Sport ne s&apos;applique pas aux
            stages ni aux achats de matériel ou de consommations autres que liées à la pratique (par
            exemple, les boissons) ;
          </li>
          <li>
            Respecter les obligations de qualification professionnelle (article L. 212-1 du code du
            sport) et s&apos;assurer que ses éducateurs sportifs possèdent une carte professionnelle
            et sont déclarés sur EAPS, le Portail Public des Éducateurs Sportifs, pour garantir un
            contrôle d&apos;honorabilité ;
          </li>
          <li>
            Appliquer immédiatement, lors de l&apos;inscription, la réduction de 70€ en échange du
            pass Sport délivré par le ministère chargé des Sports ;
          </li>
          <li>
            Établir, dans les 6 mois, une collaboration durable avec un ou plusieurs clubs sportifs
            locaux affiliés à une fédération sportive agréée ou agréés JEP ou Sport (mutualisation
            des espaces ou du temps éducateur, communication partagée, etc.).
          </li>
        </ol>
        <p className="fr-mb-2w">
          Si c&apos;est le cas, vous devrez vous créer un compte sur{' '}
          <Link
            href="https://lecompteasso.associations.gouv.fr/"
            target="_blank"
            title="Lien vers Le Compte Asso (nouvelle fenêtre)"
            className="fr-link"
          >
            Le Compte Asso
          </Link>{' '}
          ou le mettre à jour.
        </p>
        Un{' '}
        <Link
          href="https://view.genially.com/68a832edc26eae6fb0633be1"
          title="Consultez le tutorial - Nouvelle fenêtre"
          target="_blank"
          className="fr-link"
        >
          tutoriel
        </Link>{' '}
        est disponible pour vous accompagner.
      </Accordion>
      <Accordion label="Je n’appartiens à aucune de ces structures" onExpandedChange={() => {}}>
        <p>
          Seules les structures appartenant à l’une de ces catégories sont éligibles au dispositif
          pass Sport.
        </p>
      </Accordion>
    </>
  );
}
