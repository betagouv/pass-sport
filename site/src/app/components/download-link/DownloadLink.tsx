type DownloadLinkProps = {
  details: string;
  label: string;
  href: string;
};

export function DownloadLink({ details, label, href }: DownloadLinkProps) {
  return (
    <div className="fr-download">
      <p>
        <a href={href} download className="fr-download__link">
          {label}
        </a>
        <span className="fr-download__detail">{details}</span>
      </p>
    </div>
  );
}
