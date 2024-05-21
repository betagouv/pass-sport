import { useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import YoungCafForm from '../step-two-forms/YoungCafForm';
import { ConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import YoungMsaForm from '../step-two-forms/YoungMsaForm';
import AahCafForm from '../step-two-forms/AahCafForm';
import QrCodeVerdict from '../qrcode-verdict/QrCOdeVerdict';
import AahMsaForm from '../step-two-forms/AahMsaForm';
import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';

const EligibilityTestForms = () => {
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setpspCodeData] = useState<ConfirmResponseBody | null>(null);

  return (
    <div>
      <StepOneForm
        onDataRecieved={(data: SearchResponseBody) => {
          setEligibilityData(data);
          setpspCodeData(null);
        }}
      />

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'CAF' && (
          <YoungCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'MSA' && (
          <YoungMsaForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'AAH' &&
        eligibilityData[0].organisme === 'CAF' && (
          <AahCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'AAH' &&
        eligibilityData[0].organisme === 'MSA' && (
          <AahMsaForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {((eligibilityData && eligibilityData.length === 0) ||
        (pspCodeData && pspCodeData.length === 0)) && (
        <div className="fr-mt-6w">
          <VerdictPanel
            title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes
        pas éligible au pass Sport"
            isSuccess={false}
            isLean
          >
            <div className="fr-mb-2w">En effet, ce dispositif est ouvert aux:</div>
            <EligibilityCriteriaList />
            <span className={cn('fr-text--bold', rootStyles['text--black'])}>
              Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à
              vous rapprocher de votre région, département ou commune de résidence.
            </span>
          </VerdictPanel>
        </div>
      )}

      {pspCodeData && pspCodeData.length > 0 && (
        <div className="fr-mt-6w">
          <QrCodeVerdict data={pspCodeData[0]} />
        </div>
      )}
    </div>
  );
};

export default EligibilityTestForms;
