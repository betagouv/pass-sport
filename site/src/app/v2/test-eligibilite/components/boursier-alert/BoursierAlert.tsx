import { useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import EligibilityTestContext from '@/store/eligibilityTestContext';

interface Props {
  allowance: ALLOWANCE.CROUS | ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX;
}

const BoursierAlert = ({ allowance }: Props) => {
  const alertRef = useRef<HTMLDivElement>(null);
  const { verdictNode } = useContext(EligibilityTestContext);

  useEffect(() => {
    alertRef.current?.focus();
  }, [verdictNode]);

  if (!verdictNode) {
    return null;
  }

  return createPortal(
    <div ref={alertRef} tabIndex={-1} className="fr-mb-4w">
      <Alert
        severity="info"
        title={
          allowance === ALLOWANCE.CROUS
            ? "Les étudiants boursiers de l'enseignement supérieur recevront leur code par courriel entre le 9 octobre et le 15 novembre."
            : 'Les étudiants boursiers des formations sanitaires et sociales recevront leur code par courriel entre le 9 octobre et le 15 novembre.'
        }
        description={
          <p>
            Si vous n&apos;avez pas reçu votre code d&apos;ici le 15 novembre, vous pourrez venir le
            récupérer sur le site du pass Sport.
          </p>
        }
      />
    </div>,
    verdictNode,
  );
};

export default BoursierAlert;
