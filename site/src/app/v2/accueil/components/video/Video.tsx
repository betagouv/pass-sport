'use client';

import Link from 'next/link';
import styles from './styles.module.scss';
import cn from 'classnames';
import { useUpdateTitleIframe } from '@/app/hooks/accessibility/use-update-title-iframe';
import { useRef } from 'react';

interface Props {
  videoFullUrl: string;
}

const Video = ({ videoFullUrl }: Props) => {
  const title =
    'Vidéo de présentation du dispositif pass Sport avec deux athlètes français : Lucie Hautière (para tennis de table) et Simon Boypa (athlétisme).\n';
  const parentRef = useRef<HTMLDivElement | null>(null);

  useUpdateTitleIframe({
    parentRef,
    title,
    targetSelector: 'iframe',
  });

  return (
    <div ref={parentRef}>
      <figure className="fr-my-2w fr-content-media">
        <div className={cn('vimeo_player', styles['vimeo_player'])} data-videoid="1113160982" />
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
                          Vidéo de présentation du dispositif pass Sport avec deux athlètes français
                          : Lucie Hautière (para tennis de table) et Simon Boypa (athlétisme).
                        </h1>
                        <div>
                          <p>Lucie : Bonne nouvelle, la campagne pass Sport est lancée. </p>
                          <p>
                            Simon : Cette année, c&apos;est 70€ pour aider les jeunes à pratiquer un
                            sport, sous conditions d&apos;éligibilité.
                          </p>
                          <p>Lucie : C&apos;est super simple à utiliser.</p>
                          <p>
                            Simon : T&apos;as rien à faire. Si tu es éligible, tu recevras un code
                            directement par mail ou par SMS.
                          </p>
                          <p>
                            Lucie : Ensuite, Il suffit de le montrer à ton club ou à ta salle de
                            sport au moment de l&apos;inscription.
                          </p>
                          <p>
                            Simon : Il y a plus de 85 000 clubs, associations sportives et salles de
                            sport qui sont partenaires. Si tu n&apos;as pas reçu de code, pas de
                            panique, tu peux le demander sur le site pass.sport.gouv.fr.
                          </p>
                          <p>
                            Lucie : Le pass est valable du 1er septembre au 31 décembre 2025, pense
                            à l’activer à temps.
                          </p>
                          <p>
                            Simon : Pour plus d&apos;infos, rendez vous sur le site internet et les
                            réseaux sociaux de pass Sport. Envie de bouger ? pass Sport, faites
                            entrer le sport dans votre vie.
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
