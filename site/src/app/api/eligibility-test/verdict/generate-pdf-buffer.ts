import { renderToBuffer } from '@react-pdf/renderer';
import PdfPassSport from '@/app/components/pdf-pass-sport/PdfPassSport';

type GeneratePdfProps = {
  firstname: string;
  lastname: string;
  dob: string;
  code: string;
  gender: 'F' | 'M';
};

// Login decoupled for mocking in test purposes
export function generatePdfBuffer({ firstname, lastname, dob, code, gender }: GeneratePdfProps) {
  return renderToBuffer(
    PdfPassSport({
      benef: {
        firstname,
        lastname,
        dob,
        code,
        gender,
      },
    }),
  );
}
