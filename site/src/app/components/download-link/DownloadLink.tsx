type DownloadLinkProps = {
  details: string;
  label: string;
  href: string;
  filename?: string;
  onClick?: () => void;
};

export function DownloadLink({ details, label, href, onClick, filename }: DownloadLinkProps) {
  return (
    <div className="fr-download">
      <p>
        <a
          href={href}
          className="fr-download__link"
          {...(onClick ? { onClick } : {})}
          {...(filename ? { download: filename } : { download: true })}
        >
          {label}
        </a>
        <span className="fr-download__detail">{details}</span>
      </p>
    </div>
  );
}
