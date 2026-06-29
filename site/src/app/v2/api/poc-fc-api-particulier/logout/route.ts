import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  FC_ID_TOKEN_COOKIE,
  FC_RESULT_COOKIE,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
} from '@/app/v2/api/poc-fc-api-particulier/shared';

const PAGE_PATH = '/v2/poc-fc-api-particulier';

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  cookieStore.delete(FC_RESULT_COOKIE);
  cookieStore.delete(FC_ID_TOKEN_COOKIE);
  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  return NextResponse.redirect(new URL(`${PAGE_PATH}?status=loggedout`, request.url));
}
