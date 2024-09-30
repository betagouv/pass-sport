import { useEffect, useRef, useState } from 'react';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import { useRouter } from 'next/navigation';
import rootStyles from '@/app/utilities.module.scss';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import cn from 'classnames';
import { trackRedirectionToPassSportForm } from '@/app/v2/test-eligibilite-base/helpers/helpers';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';

interface Props {
  isForChild: boolean;
}

const AllowancesStep = ({ isForChild }: Props) => {
  const [hasAllowances, setHasAllowances] = useState<boolean | null>(null);
  const [isValidated, setIsValidated] = useState(true);

  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const fieldsetId = 'allowancesStep-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
    }
  }, []);

  const successCallout = (
    <div>
      <VerdictPanel
        title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous êtes éligible au pass Sport."
        isSuccess
        buttonProps={{
          children: "Accéder au formulaire d'obtention du pass Sport",
          onClick: () => {
            trackRedirectionToPassSportForm();
            router.push('test-eligibilite');
          },
        }}
      >
        <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
          Il vous permettra de déduire 50 euros de votre adhésion sportif dans plus de 85 000 clubs
          et associations sportives partenaires dans toute la France.
        </p>
      </VerdictPanel>
    </div>
  );

  const failureCallOut = (
    <VerdictPanel
      title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes pas éligible au pass Sport"
      isSuccess={false}
    >
      <p className={cn('fr-text--lg', rootStyles['text--black'], rootStyles['text--medium'])}>
        En effet, ce dispositif n&apos;est pas accessible à tous, il est ouvert aux:
      </p>
      <EligibilityCriteriaList />
    </VerdictPanel>
  );

  const beforeQuestionText = (
    <div tabIndex={-1} ref={ref}>
      <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
        L&apos;attribution du pass sport est conditionnée aux aides suivantes&nbsp;:
      </p>
      <ul className="fr-ml-2w">
        <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
          bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de ressources, aide
          annuelle du <CROUS /> ou bourse régionale pour les formations sanitaires et sociales pour
          l&apos;année universitaire 2023-2024 ou 2024-2025
        </li>
        <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
          allocation aux adultes handicapées (<abbr>AAH</abbr>)
        </li>

        <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
          allocation de rentrée scolaire (<abbr>ARS</abbr>)
        </li>

        <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
          allocation d&apos;éducation de l&apos;enfant handicapé (<abbr>AEEH</abbr>)
        </li>
      </ul>
    </div>
  );

  return (
    <>
      <CustomRadioButtons
        id={fieldsetId}
        name="allowanceStep"
        legendLine1="Votre enfant (ou petit enfant) bénéficie-t-il d'une de ces aides ?"
        isOkButtonDisabled={isValidated}
        onOkButtonClicked={buttonClickedHandler}
        legendDescription={beforeQuestionText}
        options={[
          {
            label: 'Oui',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setHasAllowances(true);
              },
            },
          },
          {
            label: 'Non',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setHasAllowances(false);
              },
            },
          },
        ]}
      />
      {isValidated && hasAllowances && successCallout}
      {isValidated && hasAllowances === false && failureCallOut}
    </>
  );
};

export default AllowancesStep;
