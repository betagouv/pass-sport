import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { searchCommunesByName, searchCommunesByPostalCodeAndName } from '@/app/services/communes';
import { communesSearchQuerySchema } from '@/app/api/communes/schema';

export function GET(request: NextRequest): Response {
  const searchParams = request.nextUrl.searchParams;

  let query;
  try {
    query = communesSearchQuerySchema.parse({
      name: searchParams.get('name') ?? '',
      postalCode: searchParams.get('postalCode') ?? undefined,
      includeDistricts: searchParams.get('includeDistricts') ?? 'false',
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return new NextResponse(e.message, { status: 400 });
    }
    throw e;
  }

  if (!query.name) {
    return NextResponse.json([]);
  }

  const cities = query.postalCode
    ? searchCommunesByPostalCodeAndName(query.postalCode, query.name, query.includeDistricts)
    : searchCommunesByName(query.name, query.includeDistricts);

  return NextResponse.json(cities);
}
