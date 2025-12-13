'use client';

import styles from './styles.module.scss';
import { formatPhoneNumber } from '@/app/v2/trouver-un-club/[club-name]/helpers';
import MedicalCertificatePanel from '../medicalCertificatPanel/MedicalCertificatePanel';
import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useGetClubs } from '@/app/hooks/use-get-clubs';
import cn from 'classnames';
import Link from 'next/link';
import { useGetMapUrl } from '../../hooks/use-get-map-url';
import { push } from '@socialgouv/matomo-next';
import ClubTags from '../../../components/club-tags/ClubTags';
import rootStyles from '@/app/utilities.module.scss';

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
          <h1 className="fr-h2">{club.nom}</h1>
          <ClubTags club={club} small />

          <div className={styles['contact-wrapper']}>
            <section className={styles.contact}>
              <address className={cn(rootStyles['list--lean'], 'fr-text--xs')}>
                {club.adresse || club.commune ? (
                  <span>
                    <span
                      className={`fr-pr-1w fr-icon-map-pin-2-line ${styles['icon-color']} fr-icon--sm`}
                      aria-hidden="true"
                    />
                    <span>
                      {club.adresse && club.adresse}
                      {club.adresse && club.commune && ', '}
                      {club.commune && club.commune}
                    </span>
                  </span>
                ) : (
                  <span>Adresse non disponible</span>
                )}

                {club.telephone && (
                  <span>
                    <br />
                    <span
                      className={`fr-pr-1w fr-icon-phone-line ${styles['icon-color']} fr-icon--sm`}
                      aria-hidden="true"
                    />
                    <span>{formatPhoneNumber(club.telephone)}</span>
                  </span>
                )}

                {club.courriel && (
                  <span>
                    <br />
                    <span
                      className={`fr-pr-1w fr-icon-mail-line ${styles['icon-color']} fr-icon--sm`}
                      aria-hidden="true"
                    />
                    <span>{club.courriel}</span>
                  </span>
                )}
              </address>
            </section>

            {mapUrl && (
              <div className={styles['contact-itinerary']}>
                <Link
                  href={mapUrl}
                  target="_blank"
                  title="Ouvrir une nouvelle fenêtre vers google maps contenant l'itinéraire vers le club"
                  onClick={onGoToItinerary}
                >
                  Voir l&apos;itinéraire
                </Link>
              </div>
            )}
          </div>

          <hr className={`fr-mt-3w fr-mb-0 fr-mx-0 ${styles.separator}`} />

          <>
            <h2 className="fr-h3">Les activités</h2>
            {Array.isArray(club.activites) ? (
              <ul className={styles.activities}>
                {club.activites?.map((activity) => (
                  <li key={activity} className="fr-mr-3w fr-p-0">
                    {activity}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Activités non disponibles</p>
            )}

            <hr className={`fr-mt-3w fr-mb-0 fr-mx-0 ${styles.separator}`} />
          </>
        </section>

        <section>
          <h2
            className="fr-h4"
            aria-label="Où nous trouver. Carte interactive de l'emplacement du club"
          >
            Où nous trouver
          </h2>
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
