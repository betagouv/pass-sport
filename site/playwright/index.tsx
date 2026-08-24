// Entry point for Playwright component tests (playwright-ct.config.ts). Loaded once per
// mounted component; brings in the DSFR stylesheet so components using DSFR classes
// (e.g. .fr-badge) render with their real styling instead of unstyled markup.
import '@codegouvfr/react-dsfr/main.css';
