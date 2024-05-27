import { buildLCAConfirmUrl } from '@/app/services/eligibility-test';
import { addQrCodeToConfirmResponse } from '@/app/services/qr-code';
import { NextResponse } from 'next/server';
import { ConfirmResponseBody, ConfirmResponseErrorBody } from 'types/EligibilityTest';

export async function POST(request: Request) {
  const formData = await request.formData();
  let url: URL;

  try {
    url = buildLCAConfirmUrl(formData);
    const response = await fetch(url);
    const responseBody = (await response.json()) as ConfirmResponseBody | ConfirmResponseErrorBody;

    if ('message' in responseBody) {
      console.log(responseBody);
      return NextResponse.json(responseBody);
    }

    const enhancedResponse = addQrCodeToConfirmResponse(responseBody);
    return NextResponse.json(enhancedResponse);
  } catch (e) {
    console.log(e);
    return NextResponse.json('Internal error', { status: 500 });
  }
}
