'use client';

import styles from './styles.module.scss';
import cn from 'classnames';
import { useUpdateTitleIframe } from '@/app/hooks/accessibility/use-update-title-iframe';
import { useRef } from 'react';

interface Props {
  videoFullUrl: string;
  videoId: string;
}

const Video = ({ videoFullUrl, videoId }: Props) => {
  const title = 'Vidéo de présentation du dispositif pass Sport';
  const parentRef = useRef<HTMLDivElement | null>(null);

  useUpdateTitleIframe({
    parentRef,
    title,
    targetSelector: 'iframe',
  });

  return (
    <div ref={parentRef}>
      <figure className="fr-my-2w fr-content-media">
        <div className={cn('vimeo_player', styles['vimeo_player'])} data-videoid={videoId} />
        <figcaption className="fr-content-media__caption">
          {title}
          <a
            className="fr-link"
            href={videoFullUrl}
            aria-label="Ouvrir une nouvelle fenêtre vers la vidéo Viméo"
            target="_blank"
          >
            Voir la vidéo sur Viméo
          </a>
        </figcaption>
        <div className="fr-transcription" id="transcription-2160">
          <button
            className="fr-transcription__btn"
            aria-expanded="false"
            aria-controls="fr-transcription-collapse-transcription-2160"
            data-fr-js-collapse-button="true"
          >
            Transcription
          </button>
          <div
            className="fr-collapse"
            id="fr-transcription-collapse-transcription-2160"
            data-fr-js-collapse="true"
          >
            <div className="fr-transcription__footer">
              <div className="fr-transcription__actions-group">
                <button
                  className="fr-btn--fullscreen fr-btn"
                  aria-controls="fr-transcription-modal-transcription-2160"
                  aria-label="Agrandir la transcription"
                  data-fr-opened="false"
                  id="button-2163"
                  data-fr-js-modal-button="true"
                >
                  Agrandir
                </button>
              </div>
            </div>
            <dialog
              id="fr-transcription-modal-transcription-2160"
              className="fr-modal"
              aria-labelledby="fr-transcription-modal-transcription-2160-title"
              data-fr-js-modal="true"
            >
              <div className="fr-container fr-container--fluid fr-container-md">
                <div className="fr-grid-row fr-grid-row--center">
                  <div className="fr-col-12 fr-col-md-10 fr-col-lg-8">
                    <div className="fr-modal__body" data-fr-js-modal-body="true">
                      <div className="fr-modal__header">
                        <button
                          className="fr-btn--close fr-btn"
                          aria-controls="fr-transcription-modal-transcription-2160"
                          id="button-2164"
                          title="Fermer"
                          data-fr-js-modal-button="true"
                        >
                          Fermer
                        </button>
                      </div>
                      <div className="fr-modal__content">
                        <h1
                          id="fr-transcription-modal-transcription-2160-title"
                          className="fr-modal__title"
                        >
                          Vidéo de présentation du dispositif pass Sport
                        </h1>
                        <div>
                          <p className="fr-mb-1w">
                            50 € de réduction pour mon inscription au football ? Oui, avec le pass
                            Sport. On donne le code au club et hop.
                          </p>
                          <p className="fr-mb-1w">
                            Génial. Et ma sœur peut aussi s&apos;inscrire au basket-fauteuil ? Oui,
                            c&apos;est valable pour tous les sports et même pour la salle de sport.
                          </p>
                          <p className="fr-mb-1w">
                            Le pass Sport est ouvert aux jeunes de 6 à 17 ans sous condition de
                            ressources, aux jeunes en situation de handicap de 6 à 30 ans
                            bénéficiaires d&apos;aides spécifiques, ainsi qu&apos;aux étudiants
                            boursiers jusqu&apos;à 28 ans.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </dialog>
          </div>
        </div>
      </figure>
    </div>
  );
};

export default Video;
