import Notice from '@codegouvfr/react-dsfr/Notice';
import { isPasSportClosed } from '@/utils/date';

const EndPassSportNotice = () =>
  isPasSportClosed() && (
    // todo: to confirm wording
    <Notice title="Le dispositif pass Sport rouvrira le 1er juin 2025"></Notice>
  );

export default EndPassSportNotice;
