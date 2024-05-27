import { buildLCAConfirmUrl } from '@/app/services/eligibility-test';
import { addQrCodeToConfirmResponse } from '@/app/services/qr-code';
import { NextResponse } from 'next/server';
import { ConfirmResponseBody } from 'types/EligibilityTest';

export async function POST(request: Request) {
  const formData = await request.formData();
  let url: URL;

  try {
    url = buildLCAConfirmUrl(formData);
    const response = await fetch(url);
    const responseBody = (await response.json()) as ConfirmResponseBody;

    const enhancedResponse = addQrCodeToConfirmResponse(responseBody);
    return NextResponse.json(enhancedResponse);
  } catch (e) {
    console.log(e);
    return NextResponse.json('hello');
  }
}
