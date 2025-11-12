import Actions from '@/app/components/actions/Actions';
import Alert from '@codegouvfr/react-dsfr/Alert';

interface Props {
  title: string;
}
const ErrorAlert = ({ title }: Props) => (
  <>
    <Alert
      severity="error"
      title={title}
      // @ts-ignore
      role="alert"
    />
    <div className="fr-mt-4w">
      <Actions />
    </div>
  </>
);

export default ErrorAlert;
