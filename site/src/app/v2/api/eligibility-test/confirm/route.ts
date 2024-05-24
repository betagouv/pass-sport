import { buildLCAConfirmUrl } from '@/app/services/eligibility-test';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  let url: URL;

  try {
    url = buildLCAConfirmUrl(formData);
    const response = await fetch(url);
    const responseBody = await response.json();
    return NextResponse.json(responseBody);
  } catch (e) {
    console.log(e);
    return NextResponse.json('hello');
  }
}
