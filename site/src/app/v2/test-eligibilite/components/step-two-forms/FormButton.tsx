import Button from '@codegouvfr/react-dsfr/Button';

interface Props {
  isDisabled: boolean;
}
const FormButton = ({ isDisabled }: Props) => (
  <Button
    priority="primary"
    iconId={isDisabled ? 'fr-icon-success-line' : 'fr-icon-arrow-right-line'}
    iconPosition="right"
    disabled={isDisabled}
    className="fr-mt-3w"
  >
    Valider les informations
  </Button>
);

export default FormButton;
