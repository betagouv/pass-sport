import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { FC_LOGOUT_STATE_COOKIE } from '@/app/v2/api/poc-fc-api-particulier/shared';

const PAGE_PATH = '/v2/poc-fc-api-particulier';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FC_LOGOUT_STATE_COOKIE)?.value;
  cookieStore.delete(FC_LOGOUT_STATE_COOKIE);

  // State mismatch: nothing sensitive left to protect (session already gone),
  // but surface it instead of a silent success.
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL(`${PAGE_PATH}?error=logout_state`, request.url));
  }

  return NextResponse.redirect(new URL(`${PAGE_PATH}?status=loggedout`, request.url));
}
