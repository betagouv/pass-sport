export default function TranscriptionRefundPassSport() {
  return (
    <>
      <p className="fr-mb-1w">
        Vous êtes un club ou une salle de sport et vous souhaitez valider un pass Sport ? Dans cette
        vidéo, je vous explique comment vous faire rembourser les pass Sport de vos nouveaux
        inscrits...
      </p>

      <p className="fr-mb-1w">
        Tout d&apos;abord, commencez par vous connecter à votre compte asso sur
        lecompteasso.associations.gouv.fr.
      </p>

      <p className="fr-mb-1w">
        Si vous n&apos;avez pas de compte, créez-le et associez votre club avec votre compte asso,
        grâce à votre Siret/siren et/ou votre numéro RNA. Pour vous aider, nous avons fait une autre
        vidéo que vous trouverez dans l’espace club du site internet pass.sports.gouv.fr, rubrique
        “Tout savoir sur le pass Sport”
      </p>

      <p className="fr-mb-1w">
        Une fois que votre structure (club ou salle de sport)est associée à votre compte asso,
        rendez-vous sur la page d&apos;accueil.
      </p>

      <p className="fr-mb-1w">Cliquez sur le bouton “Gérer les inscriptions pass Sport”.</p>

      <p className="fr-mb-1w">
        Maintenant, il va falloir contrôler que vos informations rentrées l’année dernière n’ont pas
        évolué. Relisez les informations à partir de “saisir les caractéristiques de la structure”
        jusqu’à” saisir les coordonnées de correspondance du siège” et modifiez-les si nécessaire.
      </p>

      <p className="fr-mb-1w">N&apos;oubliez pas d’enregistrer !</p>

      <p className="fr-mb-1w">
        {/* todo: update chart year if chart is different*/}
        Si votre structure est à un but lucratif et relève du champ du loisir sportif marchand,
        déposez la charte 2024 d’engagement des loisirs sportifs marchands.
      </p>

      <p className="fr-mb-1w">
        Cette charte est transmise par les têtes de réseaux (Union Sport et Cycle, COSMOS,
        ACTIVE-FNEAL) si vous en êtes adhérents mais elle est également disponible sur le site
        pass.sports.gouv.fr / rubrique “Tout savoir sur le pass Sport” si vous n’êtes pas adhérent.
      </p>

      <p className="fr-mb-1w">
        {/* todo: update chart year if chart is different*/}
        Nouveauté 2024 : si vous êtes adhérent à l&apos;Union Sport et Cycle (USC), vous n&apos;avez
        plus besoin de déposer la charte 2024. Transmettez-la seulement à votre tête de réseau.
      </p>

      <p className="fr-mb-1w">
        Votre compte asso est maintenant à jour, il ne reste plus qu&apos;à saisir ou mettre à jour
        le RIB de votre club avant de cliquer sur “suivi des inscriptions pass Sport”.
      </p>

      <p className="fr-mb-1w">
        Une fois que votre RIB est à jour, pour valider un pass, cliquez sur ajouter un
        bénéficiaire, saisissez le code unique à 10 caractères et vérifiez que les informations
        correspondent bien avec l’adhérent. N’oubliez pas de valider !
      </p>

      <p className="fr-mb-1w">
        La demande sera transmise automatiquement dans les minutes suivantes, vous verrez son état
        évoluer jusqu’à une phase « payé » qui correspondra au remboursement de ce pass !
      </p>

      <p className="fr-mb-1w">
        Si un message d&apos;erreur apparaît, vérifiez que le licencié ne soit pas déjà inscrit, ou
        que son pass ne soit pas d’une année antérieure ou que vous ne l&apos;avez pas déjà saisi
        précédemment. Pour rappel le pass Sport est à usage unique et valable pour l&apos;année en
        cours seulement.
      </p>

      <p className="fr-mb-1w">
        C’est terminé, il ne vous reste plus qu’à attendre le paiement des pass que vous venez de
        valider. En moyenne, les pass vous sont remboursés de 30 à 45 jours à partir du moment de
        leur saisi.
      </p>
    </>
  );
}
