import Actions from '@/app/components/actions/Actions';
import Alert from '@codegouvfr/react-dsfr/Alert';

interface Props {
  title: string;
}
const ErrorAlert = ({ title }: Props) => (
  <>
    <Alert severity="error" title={title} />
    <div className="fr-mt-4w">
      <Actions />
    </div>
  </>
);

export default ErrorAlert;
