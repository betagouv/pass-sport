import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { SearchResponseBody } from '@/types/EligibilityTest';

type CorrectiveInfoProps = {
  situation?: SearchResponseBody[0]['situation'];
  originalAllowance: ALLOWANCE | null;
};

// Component that is mainly use to autocorrect beneficiary's allowance
// Example: User is beneficiary of AAH, but selects ARS and fill in the information
// is correct but the allowance is incorrect, we display an alert information saying that
// The allowance has been automatically corrected as to not interrupt the beneficiary's flow
export default function CorrectiveInfo({ situation, originalAllowance }: CorrectiveInfoProps) {
  if (originalAllowance === null) return;

  return (
    <div id="corrective-info" aria-live="polite" aria-atomic>
      {situation === 'boursier' && originalAllowance !== ALLOWANCE.CROUS && (
        <div className="fr-mb-3w fr-ml-n1v">
          <Alert
            severity="info"
            title="Informations"
            description={`Vous avez indiqué êtes bénéficiaire de l'aide ${originalAllowance}. D'après les informations dont nous disposons, vous êtes un étudiant boursier, nous avons modifié cette information pour que vous puissiez demander votre code.`}
          />
        </div>
      )}

      {/* Since we cannot differentiate ARS and AEEH, we display the same message for both */}
      {situation === 'jeune' && ![ALLOWANCE.ARS, ALLOWANCE.AEEH].includes(originalAllowance) && (
        <div className="fr-mb-3w fr-ml-n1v">
          <Alert
            severity="info"
            title="Informations"
            description={`Vous avez indiqué êtes bénéficiaire de l'aide ${originalAllowance}. D'après les informations dont nous disposons, vous êtes bénéficiaire de l'ARS (Allocation de Rentrée Scolaire), nous avons modifié cette information pour que vous puissiez demander votre code.`}
          />
        </div>
      )}

      {situation === 'AAH' && originalAllowance !== ALLOWANCE.AAH && (
        <div className="fr-mb-3w fr-ml-n1v">
          <Alert
            severity="info"
            title="Informations"
            description={`Vous avez indiqué êtes bénéficiaire de l'aide ${originalAllowance}. D'après les informations dont nous disposons, vous êtes bénéficiaire de l'AAH (Allocation Adulte Handicapé), nous avons modifié cette information pour que vous puissiez demander votre code.`}
          />
        </div>
      )}
    </div>
  );
}
