import { useEffect, useRef, useState } from 'react';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import { PASS_SPORT_AMOUNT } from '@/app/constants/wordings';

const AllowancesStep = () => {
  const [hasAllowances, setHasAllowances] = useState<boolean | null>(null);
  const [isValidated, setIsValidated] = useState(true);
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
        // todo: Enable later in august
        // buttonProps={{
        //   children: "Accéder au formulaire d'obtention du pass Sport",
        //   onClick: () => {
        //     trackRedirectionToPassSportForm();
        //     router.push('test-eligibilite');
        //   },
        // }}
      >
        <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
          Il vous permettra de déduire {PASS_SPORT_AMOUNT} euros sur l&apos;inscription prise entre
          le 1er septembre et le 31 décembre 2025, parmi plus de 59 000 clubs, associations
          sportives et salles de sport partenaire.
        </p>
      </VerdictPanel>
    </div>
  );

  const failureCallOut = <FullNegativeVerdictPanel isLean />;

  const beforeQuestionText = (
    <div tabIndex={-1} ref={ref}>
      <ul className="fr-ml-2w">
        <li className={`fr-mb-1w fr-mt-2w ${rootStyles['text--medium']}`}>
          Allocation d&apos;éducation de l&apos;enfant handicapé (<abbr>AEEH</abbr>) ;
        </li>
        <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
          Allocation de rentrée scolaire (<abbr>ARS</abbr>) ;
        </li>
        <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
          Allocation aux adultes handicapés (<abbr>AAH</abbr>) ;
        </li>
        <li className={`fr-mb-1w ${rootStyles['text--medium']}`}>
          Moins de 28 ans et bourse du <CROUS />
          (y compris l’aide annuelle), attribuée avant le 15 octobre 2025 ;
        </li>
        <li className={`fr-mb-0w ${rootStyles['text--medium']}`}>
          Moins de 28 ans et bourse régionale pour une formation sanitaire ou sociale.
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
