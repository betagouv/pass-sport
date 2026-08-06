import Input from '@codegouvfr/react-dsfr/Input';
import {
  ChangeEvent,
  FocusEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { push } from '@socialgouv/matomo-next';
import {
  EligibilityFieldName,
  EligibilityFormInputsState,
  EnhancedConfirmResponseBody,
  SearchResponseBody,
  SearchResponseBodyItem,
  SearchResponseErrorBody,
  SituationType,
} from 'types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import CityFinder from '../city-finder/CityFinder';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import CommonInputs from './common-inputs/CommonInputs';
import FormButton from './FormButton';
import VerdictPanel from '../verdict-panel/VerdictPanel';
import { convertDate, mapper } from '../../helpers/helper';
import { fetchEligible, fetchPspCode } from '../../agent';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { CAISSE } from '@/utils/eligibility-test';

const BENEFICIARY_FIELDS: EligibilityFieldName[] = [
  'beneficiaryLastname',
  'beneficiaryFirstname',
  'recipientResidencePlace',
];

const initialInputsState: EligibilityFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientCafNumber: { state: 'default' },
  recipientIneNumber: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
};

const CAF_NUMBER_ERROR = (
  <>
    Le numéro&nbsp; <CAF /> &nbsp;doit être composé de 7 chiffres
  </>
);

/* Single source of truth for the field rules, shared by the blur handler and the submit validation */
const getFieldError = (
  field: EligibilityFieldName,
  value: string,
  isRequired: boolean,
): ReactNode | null => {
  if (!value) {
    return isRequired ? mapper[field] : null;
  }

  if (field === 'recipientCafNumber' && !/^\d{7}$/.test(value)) {
    return CAF_NUMBER_ERROR;
  }

  return null;
};

const MISMATCH_ERROR =
  'Les informations transmises ne correspondent pas à la situation et à la caisse que vous avez indiquées. Cliquez sur « Modifier » pour les corriger.';

/* The allowance already determines the situation the API will answer with */
const getExpectedSituation = (allowance: ALLOWANCE | null): SituationType | null => {
  switch (allowance) {
    case ALLOWANCE.QF:
    case ALLOWANCE.AEEH:
      return 'jeune';
    case ALLOWANCE.AAH:
      return 'AAH';
    case ALLOWANCE.CROUS:
    case ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX:
      return 'boursier';
    default:
      return null;
  }
};

/**
 * The caisse-specific fields, i.e. everything /confirm needs on top of the beneficiary block.
 * Known up front for allocataires, since the situation and the caisse are both answered in step 1.
 * Boursiers are the exception: which of the two shapes applies depends on hasMatricule, and that
 * only comes back with /search.
 */
const getBranchFields = (
  situation: SituationType | null,
  caisse: CAISSE | null,
  hasMatricule?: boolean,
): EligibilityFieldName[] => {
  if (situation === 'boursier') {
    return hasMatricule ? ['recipientIneNumber'] : ['recipientBirthCountry'];
  }

  if (situation === 'jeune') {
    return caisse === CAISSE.CAF
      ? ['recipientLastname', 'recipientFirstname', 'recipientCafNumber']
      : ['recipientLastname', 'recipientFirstname', 'recipientBirthDate', 'recipientBirthCountry'];
  }

  if (situation === 'AAH') {
    return caisse === CAISSE.CAF ? ['recipientCafNumber'] : ['recipientBirthCountry'];
  }

  return [];
};

const MergedEligibilityForm = () => {
  const {
    allowance,
    caisse,
    dob,
    benefIsEligible,
    eligibilityData,
    setEligibilityData,
    pspCodeData,
    setPspCodeData,
    portalNode,
  } = useContext(EligibilityTestContext);

  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<EligibilityFormInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>();
  const [isBirthPlaceRequired, setIsBirthPlaceRequired] = useState<boolean>(false);

  // Cached /search answer, keyed on the beneficiary values it was obtained with. Lets a boursier's
  // second submit (after a missing INE or birthplace) go straight to /confirm.
  const searchCache = useRef<{ key: string; item: SearchResponseBodyItem } | null>(null);

  const situation = getExpectedSituation(allowance);
  const isBoursier = situation === 'boursier';
  const isCaf = caisse === CAISSE.CAF;

  const getBeneficiaryKey = (formData: FormData) =>
    BENEFICIARY_FIELDS.map((field) => (formData.get(field) ?? '').toString().trim()).join('|');

  const setFieldState = (field: EligibilityFieldName, hasValue: unknown) => {
    setInputStates((states) => ({
      ...states,
      [field]: hasValue ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
  };

  const isRequiredOnBlur = (field: EligibilityFieldName, formData: FormData): boolean => {
    if (BENEFICIARY_FIELDS.includes(field)) {
      return true;
    }

    if (!isBoursier) {
      return withBirthPlace(getBranchFields(situation, caisse), formData).includes(field);
    }

    const hasIne = !!(formData.get('recipientIneNumber') ?? '').toString().trim();
    const hasCountry = !!(formData.get('recipientBirthCountry') ?? '').toString().trim();

    switch (field) {
      case 'recipientIneNumber':
        return !hasCountry;
      case 'recipientBirthCountry':
        return !hasIne;
      default:
        return false;
    }
  };

  const onFieldBlur =
    (field: EligibilityFieldName) => (e: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      const form = e.currentTarget.form;
      const formData = form ? new FormData(form) : new FormData();
      const errorMsg = getFieldError(
        field,
        e.target.value.trim(),
        isRequiredOnBlur(field, formData),
      );

      setInputStates((states) => ({
        ...states,
        [field]: errorMsg ? { state: 'error', errorMsg } : { state: 'default' },
      }));
    };

  /**
   * A boursier gives either an INE or a pays de naissance. Answering one makes the other optional,
   * so drop the error blur may have left on it while it still counted as required.
   */
  const clearIneOrBirthCountryError = (answeredField: EligibilityFieldName, value: string) => {
    if (!isBoursier || !value) return;

    const fieldToClear =
      answeredField === 'recipientIneNumber' ? 'recipientBirthCountry' : 'recipientIneNumber';

    setInputStates((states) => ({ ...states, [fieldToClear]: { state: 'default' } }));
  };

  const focusFirstError = (states: EligibilityFormInputsState, fields: EligibilityFieldName[]) => {
    const firstInvalid = fields.find((field) => states[field].state === 'error');

    if (!firstInvalid) return;

    formRef.current
      ?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"], #${firstInvalid}`)
      ?.focus();
  };

  // The birthplace is only asked for, and only accepted by the API, when the country is France
  const withBirthPlace = (fields: EligibilityFieldName[], formData: FormData) =>
    fields.includes('recipientBirthCountry') &&
    (formData.get('recipientBirthCountry') ?? '').toString() === 'FR'
      ? [...fields, 'recipientBirthPlace' as EligibilityFieldName]
      : fields;

  const validate = (
    formData: FormData,
    fields: EligibilityFieldName[],
  ): { isValid: boolean; states: EligibilityFormInputsState } => {
    let isValid = true;
    const states = structuredClone(initialInputsState);

    fields.forEach((field) => {
      const errorMsg = getFieldError(field, (formData.get(field) ?? '').toString().trim(), true);

      if (errorMsg) {
        states[field] = { state: 'error', errorMsg };
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const notifyError = (message = 'Une erreur a eu lieu. Merci de réessayer plus tard') => {
    setError(message);
  };

  const notifySearchError = (status: number, body: SearchResponseErrorBody) => {
    if (
      status === 400 &&
      body.message ===
        "Aucun exercice en cours, vous n'êtes pas autorisé à vous inscrire au pass Sport pour le moment."
    ) {
      notifyError('Le service est actuellement fermé');
    } else {
      notifyError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    }
  };

  const runSearch = async (formData: FormData): Promise<SearchResponseBodyItem | null> => {
    const payload = new FormData();

    BENEFICIARY_FIELDS.forEach((field) =>
      payload.set(field, (formData.get(field) ?? '').toString().trim()),
    );
    payload.set('beneficiaryBirthDate', dob ?? '');

    if (allowance) {
      payload.set('allowanceName', allowance);
    }

    // Later used to know if we need to use a default address for people who don't have any address
    if (isBoursier) {
      payload.set('isFromCrous', 'true');
    }

    const { status, body } = await fetchEligible(payload);

    if (status !== 200 || 'message' in body) {
      notifySearchError(status, body as SearchResponseErrorBody);
      return null;
    }

    setEligibilityData(body as SearchResponseBody);

    if ((body as SearchResponseBody).length === 0) {
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test unsuccessful - first step',
      ]);
      return null;
    }

    push([
      'trackEvent',
      'Eligibility Test',
      'Eligibility test step 1',
      'Eligibility test step 1 successful',
    ]);

    return (body as SearchResponseBody)[0];
  };

  const runConfirm = async (
    formData: FormData,
    item: SearchResponseBodyItem,
    branchFields: EligibilityFieldName[],
  ) => {
    const payload = new FormData();

    payload.set('id', item.id.toString());
    payload.set('situation', item.situation);
    payload.set('organisme', item.organisme);

    branchFields.forEach((field) => {
      const value = (formData.get(field) ?? '').toString().trim();

      if (field === 'recipientBirthDate') {
        payload.set(field, convertDate(value) ?? '');
        return;
      }

      // From France, only the birthplace is needed, the birth country no longer is
      if (field === 'recipientBirthCountry' && value === 'FR') {
        payload.set('recipientBirthPlace', (formData.get('recipientBirthPlace') ?? '').toString());
        return;
      }

      payload.set(field, value);
    });

    if (allowance) {
      payload.set('allowanceName', allowance);
    }

    const { status, body } = await fetchPspCode(payload);

    if (status !== 200 || 'message' in body) {
      notifyError();
      return;
    }

    setPspCodeData(body as EnhancedConfirmResponseBody);

    if ((body as EnhancedConfirmResponseBody).length > 0) {
      setIsFormDisabled(true);
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test successful',
      ]);
    } else {
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test unsuccessful - final step',
      ]);
    }
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    // Drop the verdict of the previous attempt so a stale panel doesn't outlive this submit
    setPspCodeData(null);

    const formData = new FormData(formRef.current!);

    // Boursiers can't be fully validated yet: hasMatricule decides between INE and birthplace
    const upfrontFields = isBoursier
      ? BENEFICIARY_FIELDS
      : [...BENEFICIARY_FIELDS, ...withBirthPlace(getBranchFields(situation, caisse), formData)];

    const upfrontCheck = validate(formData, upfrontFields);
    setInputStates(upfrontCheck.states);

    if (!upfrontCheck.isValid) {
      focusFirstError(upfrontCheck.states, upfrontFields);
      return;
    }

    const beneficiaryKey = getBeneficiaryKey(formData);
    let item = searchCache.current?.key === beneficiaryKey ? searchCache.current.item : null;

    if (!item) {
      searchCache.current = null;
      setEligibilityData(null);

      item = await runSearch(formData);

      if (!item) return;

      searchCache.current = { key: beneficiaryKey, item };
    }

    // /confirm keys off what /search answered, so a caisse or situation the user got wrong in
    // step 1 means the fields on screen aren't the ones the API expects
    const isDeclarationHonoured =
      item.situation.toLowerCase() === situation?.toLowerCase() &&
      (isBoursier || item.organisme === caisse);

    if (!isDeclarationHonoured) {
      notifyError(MISMATCH_ERROR);
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test unsuccessful - declaration mismatch',
      ]);
      return;
    }

    const branchFields = getBranchFields(situation, caisse, item.hasMatricule);

    if (isBoursier) {
      const branchCheck = validate(formData, withBirthPlace(branchFields, formData));
      setInputStates(branchCheck.states);

      if (!branchCheck.isValid) {
        focusFirstError(branchCheck.states, withBirthPlace(branchFields, formData));
        return;
      }
    }

    await runConfirm(formData, item, branchFields);
  };

  const onCountryChanged = (e: ChangeEvent<HTMLSelectElement>) => {
    setIsBirthPlaceRequired(e.target.value.toUpperCase() === 'FR');
    setFieldState('recipientBirthCountry', e.target.value);
    clearIneOrBirthCountryError('recipientBirthCountry', e.target.value);
  };

  const getNameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Nom de famille de l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
        return (
          <>
            Nom de famille de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Nom de famille <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getFirstnameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Prénom l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
        return (
          <>
            Prénom de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Prénom <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getResidencePlaceLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
      case ALLOWANCE.QF:
        return (
          <>
            Commune de résidence de l’allocataire <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Commune de résidence <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const caisseAcronym = isCaf ? <CAF /> : <MSA />;

  const isFailure =
    (eligibilityData && eligibilityData.length === 0) || (pspCodeData && pspCodeData.length === 0);
  const isSuccess = pspCodeData && pspCodeData.length > 0;

  return (
    <>
      <p className="fr-mb-2w fr-ml-n1w">
        Ces informations nous aideront à faire valoir vos droits.
      </p>

      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label={getNameLabel()}
          state={inputStates.beneficiaryLastname.state}
          stateRelatedMessage={inputStates.beneficiaryLastname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'beneficiaryLastname',
            onBlur: onFieldBlur('beneficiaryLastname'),
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('beneficiaryLastname', e.target.value),
            autoComplete: 'family-name',
            'aria-autocomplete': 'none',
            required: true,
            autoFocus: true,
          }}
          hintText={
            <>
              Format attendu : Nom tel qu’il est écrit sur vos papiers{' '}
              {isBoursier ? (
                <>
                  du <CROUS />
                </>
              ) : (
                <>de la {caisseAcronym}</>
              )}
              .
            </>
          }
        />

        <Input
          label={getFirstnameLabel()}
          state={inputStates.beneficiaryFirstname.state}
          stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'beneficiaryFirstname',
            onBlur: onFieldBlur('beneficiaryFirstname'),
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('beneficiaryFirstname', e.target.value),
            autoComplete: 'given-name',
            'aria-autocomplete': 'none',
            required: true,
          }}
          hintText={
            <>
              Format attendu : Prénom tel qu’il est écrit sur vos papiers{' '}
              {isBoursier ? (
                <>
                  du <CROUS />
                </>
              ) : (
                <>de la {caisseAcronym}</>
              )}
              .
            </>
          }
        />

        <CityFinder
          legend={getResidencePlaceLabel()}
          isDisabled={isFormDisabled}
          inputName="recipientResidencePlace"
          inputState={inputStates.recipientResidencePlace}
          onChanged={(text) => setFieldState('recipientResidencePlace', text)}
          onBlur={(text) => setFieldState('recipientResidencePlace', text)}
          required
        />

        {isBoursier && (
          <>
            <CustomInput
              inputProps={{
                label:
                  allowance === ALLOWANCE.CROUS ? (
                    <>
                      Numéro INE provenant du <CROUS />
                    </>
                  ) : (
                    <>Numéro INE provenant des formations sanitaires et sociales</>
                  ),
                hintText:
                  'Format attendu : composé de 11 caractères, soit 10 chiffres et 1 lettre soit 9 chiffres et 2 lettres',
                nativeInputProps: {
                  name: 'recipientIneNumber',
                  placeholder: 'ex: 0000000000X ou 00000000XX',
                  type: 'text',
                  onBlur: onFieldBlur('recipientIneNumber'),
                  onChange: (e: ChangeEvent<HTMLInputElement>) => {
                    setFieldState('recipientIneNumber', e.target.value);
                    clearIneOrBirthCountryError('recipientIneNumber', e.target.value);
                  },
                  'aria-label': 'Saisir le numéro INE',
                },
                state: inputStates.recipientIneNumber.state,
                stateRelatedMessage: inputStates.recipientIneNumber.errorMsg,
                disabled: isFormDisabled,
              }}
              secondHint="Si vous ne disposez pas de numéro INE, renseignez vos pays et commune de naissance ci-dessous."
            />

            <CommonInputs
              birthCountryInputName="recipientBirthCountry"
              birthPlaceInputName="recipientBirthPlace"
              inputStates={inputStates}
              areInputsDisabled={isFormDisabled}
              isBirthInputRequired={isBirthPlaceRequired}
              onCountryChanged={onCountryChanged}
              onCountryBlur={onFieldBlur('recipientBirthCountry')}
              onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
              isDirectBeneficiary
              shouldAutoFocus={false}
              isCountryRequired={false}
              countryLabel="Pays de naissance"
              birthPlaceLabel="Commune de naissance"
            />
          </>
        )}

        {situation === 'jeune' && (
          <>
            <Input
              label={
                <>
                  Nom de l’allocataire {caisseAcronym} <span className="text--required">*</span>
                </>
              }
              state={inputStates.recipientLastname.state}
              stateRelatedMessage={inputStates.recipientLastname.errorMsg}
              disabled={isFormDisabled}
              nativeInputProps={{
                name: 'recipientLastname',
                placeholder: 'ex: Dupont',
                'aria-label': "Saisir le nom de l'allocataire",
                required: true,
                onBlur: onFieldBlur('recipientLastname'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientLastname', e.target.value),
              }}
              hintText={
                <>
                  Format attendu : Nom de l&apos;allocataire tel qu&apos;il est écrit sur vos
                  papiers de la {caisseAcronym}.
                </>
              }
            />

            <Input
              label={
                <>
                  Prénom de l’allocataire {caisseAcronym} <span className="text--required">*</span>
                </>
              }
              state={inputStates.recipientFirstname.state}
              stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
              disabled={isFormDisabled}
              nativeInputProps={{
                name: 'recipientFirstname',
                placeholder: 'ex: Marie',
                'aria-label': "Saisir le prénom de l'allocataire",
                required: true,
                onBlur: onFieldBlur('recipientFirstname'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientFirstname', e.target.value),
              }}
              hintText={
                <>
                  Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur vos
                  papiers de la {caisseAcronym}.
                </>
              }
            />
          </>
        )}

        {!isBoursier && isCaf && (
          <CustomInput
            inputProps={{
              label: (
                <>
                  Numéro de l’allocataire <CAF /> <span className="text--required">*</span>
                </>
              ),
              hintText: 'Personne responsable du compte de l’allocation.',
              nativeInputProps: {
                name: 'recipientCafNumber',
                placeholder: 'Exemple : 0123456',
                type: 'text',
                required: true,
                onBlur: onFieldBlur('recipientCafNumber'),
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setFieldState('recipientCafNumber', e.target.value),
                'aria-label': "Saisir le numéro de l'allocataire CAF",
              },
              state: inputStates.recipientCafNumber.state,
              stateRelatedMessage: inputStates.recipientCafNumber.errorMsg,
              disabled: isFormDisabled,
            }}
            secondHint={
              <>
                Aussi appelé « numéro de dossier ». Le numéro figure en haut à gauche de tous les
                courriers émis par la <CAF /> ainsi que sur toutes les attestations que vous pouvez
                télécharger depuis votre espace personnel.
              </>
            }
          />
        )}

        {situation === 'jeune' && !isCaf && (
          <Input
            label={
              <>
                Date de naissance de l’allocataire <span className="text--required">*</span>
              </>
            }
            hintText="Exemple : 31/12/1980."
            state={inputStates.recipientBirthDate.state}
            stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
            disabled={isFormDisabled}
            nativeInputProps={{
              name: 'recipientBirthDate',
              type: 'date',
              min: '1950-01-01',
              max: '2099-12-31',
              required: true,
              onBlur: onFieldBlur('recipientBirthDate'),
              'aria-label': "Saisir la date de naissance de l'allocataire",
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setFieldState('recipientBirthDate', e.target.value),
            }}
          />
        )}

        {!isBoursier && !isCaf && (
          <CommonInputs
            birthCountryInputName="recipientBirthCountry"
            birthPlaceInputName="recipientBirthPlace"
            inputStates={inputStates}
            areInputsDisabled={isFormDisabled}
            isBirthInputRequired={isBirthPlaceRequired}
            onCountryChanged={onCountryChanged}
            onCountryBlur={onFieldBlur('recipientBirthCountry')}
            onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
            shouldAutoFocus={false}
          />
        )}

        <FormButton isDisabled={isFormDisabled} />
      </form>

      {error && (
        <div className="fr-mt-4w">
          <ErrorAlert title={error} />
        </div>
      )}

      {isFailure &&
        portalNode &&
        createPortal(
          <div className="fr-mt-6w">
            <VerdictPanel isSuccess={false} isEligible={benefIsEligible} />
          </div>,
          portalNode,
        )}

      {isSuccess &&
        portalNode &&
        createPortal(
          <div className="fr-mt-6w">
            <VerdictPanel isSuccess isEligible={benefIsEligible} />
          </div>,
          portalNode,
        )}
    </>
  );
};

export default MergedEligibilityForm;
