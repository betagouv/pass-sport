import styles from './styles.module.scss';
import { ReactNode } from 'react';

interface Props {
  videoId: string;
  title: string;
  transcriptionContent: ReactNode;
}

const Video = ({ videoId, title, transcriptionContent }: Props) => {
  return (
    <div>
      <figure role="group" className="fr-mt-n2w fr-content-media">
        <iframe
          src={`https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`}
          className={styles.iframe}
          allow="autoplay; fullscreen; picture-in-picture"
        />
        <figcaption className="fr-content-media__caption">
          {title}
          <a className={`fr-link `} href={`https://vimeo.com/${videoId}`}>
            {`https://vimeo.com/${videoId}`}
          </a>
        </figcaption>

        <div className="fr-transcription" id={`transcription-${videoId}`}>
          <button
            className="fr-transcription__btn"
            aria-expanded="false"
            aria-controls={`fr-transcription-collapse-transcription-${videoId}`}
            data-fr-js-collapse-button="true"
          >
            Transcription
          </button>
          <div
            className="fr-collapse"
            id={`fr-transcription-collapse-transcription-${videoId}`}
            data-fr-js-collapse="true"
          >
            <div className="fr-transcription__footer">
              <div className="fr-transcription__actions-group">
                <button
                  className="fr-btn--fullscreen fr-btn"
                  aria-controls={`fr-transcription-modal-transcription-${videoId}`}
                  aria-label="Agrandir la transcription"
                  data-fr-opened="false"
                  id={`button-open-${videoId}`}
                  data-fr-js-modal-button="true"
                >
                  Agrandir
                </button>
              </div>
            </div>
            <div
              id={`fr-transcription-modal-transcription-${videoId}`}
              className="fr-modal"
              aria-labelledby={`fr-transcription-modal-transcription-${videoId}-title`}
              data-fr-js-modal="true"
            >
              <div className="fr-container fr-container--fluid fr-container-md">
                <div className="fr-grid-row fr-grid-row--center">
                  <div className="fr-col-12 fr-col-md-10 fr-col-lg-8">
                    <div className="fr-modal__body" data-fr-js-modal-body="true">
                      <div className="fr-modal__header">
                        <button
                          className="fr-btn--close fr-btn"
                          aria-controls={`fr-transcription-modal-transcription-${videoId}`}
                          id={`button-close-${videoId}`}
                          title="Fermer"
                          data-fr-js-modal-button="true"
                        >
                          Fermer
                        </button>
                      </div>
                      <div className="fr-modal__content">
                        <h1
                          id={`fr-transcription-modal-transcription-${videoId}-title`}
                          className="fr-modal__title"
                        >
                          {title}
                        </h1>
                        <div>{transcriptionContent}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
};

export default Video;