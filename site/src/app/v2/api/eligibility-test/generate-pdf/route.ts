import { zfd } from 'zod-form-data';
import z, { ZodError } from 'zod';
import { generatePdfBuffer } from '@/app/v2/api/eligibility-test/confirm/generate-pdf-buffer';
import { NextResponse } from 'next/server';

const schema = zfd.formData({
  lastname: z.string(),
  firstname: z.string(),
  dob: z.string(),
  code: z.string(),
  gender: z.enum(['M', 'F']),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const { lastname, firstname, dob, gender, code } = schema.parse(await request.formData());

    const pdfBuffer = await generatePdfBuffer({
      lastname,
      firstname,
      dob,
      gender,
      code,
    });

    // 3. Set the response headers
    const headers = new Headers();

    headers.set('Content-Type', 'application/pdf');
    headers.set(
      'Content-Disposition',
      `attachment; filename="code-pass-sport${lastname}-${firstname}.pdf"`,
    );
    headers.set('Content-Length', pdfBuffer.length.toString());

    return new NextResponse(pdfBuffer, { status: 200, headers });
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json('Some fields are missing', { status: 400 });
    }

    return Response.json('Internal error', { status: 500 });
  }
}
