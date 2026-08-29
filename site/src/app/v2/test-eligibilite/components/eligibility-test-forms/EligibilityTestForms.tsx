import { useContext } from 'react';
import { createPortal } from 'react-dom';
import StepOneForm from '../step-one-form/StepOneForm';
import YoungCafForm from '../step-two-forms/YoungCafForm';
import YoungMsaForm from '../step-two-forms/YoungMsaForm';
import AahCafForm from '../step-two-forms/AahCafForm';
import AahMsaForm from '../step-two-forms/AahMsaForm';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import EmailSentPanel from '@/app/v2/test-eligibilite/components/panels/email-sent/EmailSentPanel';
import EmailSentAlert from '@/app/v2/test-eligibilite/components/panels/email-sent/EmailSentAlert';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';
import { StepOneFields } from '@/types/EligibilityTest';

/**
 * Which step-two form to draw is decided from the situation and the caisse the usager
 * declared in step 1 — LCA is no longer asked in between, so it cannot answer that question
 * any more. QF and AEEH are both the "jeune" situation; AAH is its own.
 */
const EligibilityTestForms = () => {
  const {
    allowance,
    caisse,
    portalNode,
    stepOneFields,
    setStepOneFields,
    isStepOneValidated,
    setIsStepOneValidated,
    submittedEmail,
    setSubmittedEmail,
  } = useContext(EligibilityTestContext);

  const isAah = allowance === ALLOWANCE.AAH;
  const isCaf = caisse === CAISSE.CAF;

  const validateStepOne = (fields: StepOneFields) => {
    setStepOneFields(fields);
    setIsStepOneValidated(true);
  };

  // The fields stay in the context: the form reopens on them rather than empty
  const editStepOne = () => {
    setIsStepOneValidated(false);
    setSubmittedEmail(null);
  };

  return (
    <>
      {submittedEmail && <EmailSentAlert />}

      {isStepOneValidated ? (
        <>
          <StepChecker
            title="Les informations du bénéficiaire"
            onClick={editStepOne}
            className="fr-mt-2w"
          />
          <p className="fr-ml-n1w fr-mb-2w">
            Ces informations nous aideront à faire valoir vos droits.
          </p>
        </>
      ) : (
        <p className="fr-mb-2w fr-ml-n1w">
          Ces informations nous aideront à identifier le bénéficiaire.
        </p>
      )}

      {!isStepOneValidated && (
        <div id="second-step-form" className="fr-fieldset" role="presentation">
          <StepOneForm onValidated={validateStepOne} initialFields={stepOneFields} />
        </div>
      )}

      {isStepOneValidated && (
        <div id="third-step-form" className="fr-fieldset" role="presentation">
          {!isAah && isCaf && <YoungCafForm />}
          {!isAah && !isCaf && <YoungMsaForm />}
          {isAah && isCaf && <AahCafForm />}
          {isAah && !isCaf && <AahMsaForm />}
        </div>
      )}

      {submittedEmail &&
        portalNode &&
        createPortal(
          <div className="fr-mt-6w">
            <EmailSentPanel />
          </div>,
          portalNode,
        )}
    </>
  );
};

export default EligibilityTestForms;
