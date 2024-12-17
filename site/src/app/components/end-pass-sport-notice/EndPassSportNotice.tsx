import Notice from '@codegouvfr/react-dsfr/Notice';
import { isPasSportClosed } from '@/utils/date';

const EndPassSportNotice = () =>
  isPasSportClosed() && (
    <Notice title="Le dispositif pass Sport 2024 est clos depuis le 31 décembre 2024"></Notice>
  );

export default EndPassSportNotice;
