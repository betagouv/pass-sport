'use client';

import styles from '@/app/v2/trouver-un-club/[club-name]/style.module.scss';
import { Tag } from '@codegouvfr/react-dsfr/Tag';
import { formatPhoneNumber } from '@/app/v2/trouver-un-club/[club-name]/helpers';
import MedicalCertificatePanel from '../medicalCertificatPanel/MedicalCertificatePanel';
import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useGetClubs } from '@/app/hooks/use-get-clubs';
import { DisabilityTag } from '../../../components/disability-tag/DisabilityTag';
import cn from 'classnames';
import Link from 'next/link';
import { useGetMapUrl } from '../../hooks/use-get-map-url';
import { push } from '@socialgouv/matomo-next';

interface Props {
  clubName: string;
  isProVersion?: boolean;
}

function ClubDetails({ clubName, isProVersion = false }: Props) {
  const { club, error } = useGetClubs(clubName);
  const Map = useMemo(() => dynamic(() => import('../map/Map')), []);
  const mapUrl = useGetMapUrl(club);
  const onGoToItinerary = useCallback(() => {
    push(['trackEvent', 'Check itinerary', 'Clicked', 'Itinerary on google maps']);
  }, []);

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!club) {
    return null;
  }

  return (
    <div className="fr-mx-2w fr-mb-10w">
      <div className={`fr-p-3w fr-mt-3w fr-mx-auto fr-mb-12w ${styles.panel}`}>
        <section className={styles.info}>
          <h2>{club.nom}</h2>
          <div className={`fr-my-2w ${styles.tags}`}>
            {Array.isArray(club.activites) && (
              <Tag small>
                <p className="fr-text--xs">
                  {club.activites.length} {club.activites.length > 1 ? 'activités' : 'activité'}
                </p>
              </Tag>
            )}

            <DisabilityTag club={club} small />
          </div>

          <div className={styles['contact-wrapper']}>
            <section className={styles.contact}>
              {(club.adresse || club.commune) && (
                <p className="fr-text--xs fr-m-0">
                  <span
                    className={`fr-pr-1w fr-icon-map-pin-2-line ${styles['icon-color']} fr-icon--sm`}
                    aria-hidden="true"
                  />

                  <span>
                    {club.adresse && club.adresse}
                    {club.adresse && club.commune && ', '}
                    {club.commune && club.commune}
                  </span>
                </p>
              )}

              {club.telephone && (
                <p className="fr-text--xs fr-m-0">
                  <span
                    className={`fr-pr-1w fr-icon-phone-line ${styles['icon-color']} fr-icon--sm`}
                    aria-hidden="true"
                  ></span>
                  {formatPhoneNumber(club.telephone)}
                </p>
              )}

              {club.courriel && (
                <p className="fr-text--xs fr-m-0">
                  <span
                    className={`fr-pr-1w fr-icon-mail-line ${styles['icon-color']} fr-icon--sm`}
                    aria-hidden="true"
                  ></span>
                  {club.courriel}
                </p>
              )}
            </section>

            {mapUrl && (
              <div className={styles['contact-itinerary']}>
                <Link
                  href={mapUrl}
                  target="_blank"
                  title={
                    "Ouvrir une nouvelle fenêtre vers google maps contenant l'itinéraire vers le club"
                  }
                  onClick={onGoToItinerary}
                >
                  Voir l&apos;itinéraire
                </Link>
              </div>
            )}
          </div>

          <hr className={`fr-mt-3w fr-mb-0 fr-mx-0 ${styles.separator}`} />

          {Array.isArray(club.activites) && (
            <>
              <h3>Les activités</h3>
              <ul className={styles.activities}>
                <div className={styles.grid}>
                  {club.activites?.map((activity) => (
                    <li key={activity} className="fr-mr-3w fr-p-0">
                      {activity}
                    </li>
                  ))}
                </div>
              </ul>

              <hr className={`fr-mt-3w fr-mb-0 fr-mx-0 ${styles.separator}`} />
            </>
          )}
        </section>

        <section>
          <h4 className="fr-mb-2w">Où nous trouver</h4>
          <Map club={club} />
        </section>
      </div>

      {!isProVersion && (
        <div className={cn('fr-mx-auto', styles['max-width'])}>
          <MedicalCertificatePanel />
        </div>
      )}
    </div>
  );
}

export default ClubDetails;
