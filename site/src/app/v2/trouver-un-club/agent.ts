import { City } from 'types/City';
import {
  ActivityResponse,
  SportGouvJSONExportsResponse,
  SportGouvJSONRecordsResponse,
} from 'types/Club';
import { GeoGouvRegion } from 'types/Region';
import * as Sentry from '@sentry/nextjs';
import { parseFranceRegions } from 'utils/region';
import { GeoGouvDepartment } from '../../../../types/Department';

export interface SqlSearchParams {
  offset: number;
  clubName?: string;
  regionCode?: string;
  departmentCode?: string;
  city?: string;
  postalCode?: string;
  activity?: string;
  disability?: string;
  limit?: number;
  distance?: string;
}

const buildWhereClause = (param: SqlSearchParams, excludedParams: (keyof SqlSearchParams)[]) => {
  let whereClause = 'nom is not null';

  whereClause += param?.clubName ? ` AND ${param.clubName}` : '';
  whereClause += param?.regionCode ? ` AND ${param.regionCode}` : '';
  whereClause += param?.departmentCode ? ` AND ${param.departmentCode}` : '';
  whereClause += param?.city ? ` AND ${param.city}` : '';
  whereClause += param?.postalCode ? ` AND ${param.postalCode}` : '';
  whereClause += param?.activity ? ` AND ${param.activity}` : '';
  whereClause += param?.disability ? ` AND ${param.disability}` : '';

  if (!excludedParams.includes('distance')) {
    whereClause += param.distance ? ` AND ${param.distance}` : '';
  }

  return whereClause;
};

export const getClubs = async (param: SqlSearchParams): Promise<SportGouvJSONRecordsResponse> => {
  const baseUrl =
    'https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/records';

  const params: URLSearchParams = new URLSearchParams();
  params.append('limit', param.limit ? param.limit.toString() : '20');
  params.append('offset', param.offset.toString());

  let whereClause = buildWhereClause(param, ['distance']);
  params.append('where', whereClause);

  const url = new URL(baseUrl);
  url.search = params.toString();
  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage(
        'Unexpected response from sports-sgsocialgouv.opendatasoft.com; endpoint: records',
      );
    });
    return {
      results: [],
      total_count: 0,
    };
  }

  return response.json();
};

export const getClubsWithoutLimit = async (
  param: SqlSearchParams,
): Promise<SportGouvJSONExportsResponse> => {
  const baseUrl =
    'https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/exports/json';

  const params: URLSearchParams = new URLSearchParams();

  params.append('select', 'nom,geoloc_finale');
  params.append('limit', '-1');
  let whereClause = buildWhereClause(param, []);
  params.append('where', whereClause);

  const url = new URL(baseUrl);
  url.search = params.toString();
  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage(
        'Unexpected response from sports-sgsocialgouv.opendatasoft.com; endpoint: exports',
      );
    });
    return {
      results: [],
      total_count: 0,
    };
  }

  const results = await response.json();

  return {
    results,
    total_count: results.length,
  };
};

export const getFranceRegions = async (): Promise<GeoGouvRegion[]> => {
  const url = 'https://geo.api.gouv.fr/regions';

  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage('Unexpected response from geo.api.gouv.fr for regions');
    });
    return [];
  }

  const body = await response.json();

  return parseFranceRegions(body);
};

export const getFranceDepartments = async (): Promise<GeoGouvDepartment[]> => {
  const url = 'https://geo.api.gouv.fr/departements';

  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage('Unexpected response from geo.api.gouv.fr for departments');
    });
    return [];
  }

  const body = await response.json();

  return body;
};

export const getFranceCitiesByPostalCode = async (
  postalCode: string,
  includeDistricts: boolean,
): Promise<City[]> => {
  const baseUrl = 'https://geo.api.gouv.fr/communes';

  const params = new URLSearchParams();
  params.append('limit', '20');
  params.append('boost', 'population');
  params.append('codePostal', postalCode);
  params.append(
    'type',
    includeDistricts ? 'arrondissement-municipal,commune-actuelle' : 'commune-actuelle',
  );

  const url = new URL(baseUrl);
  url.search = params.toString();
  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage('Unexpected response from geo.api.gouv.fr for cities');
    });
    return [];
  }

  return response.json();
};

export const getFranceCitiesByName = async (
  cityName: string,
  includeDistricts: boolean,
): Promise<City[]> => {
  const baseUrl = 'https://geo.api.gouv.fr/communes';

  const params = new URLSearchParams();
  params.append('limit', '30');
  params.append('boost', 'population');
  params.append('nom', cityName);
  params.append(
    'type',
    includeDistricts ? 'arrondissement-municipal,commune-actuelle' : 'commune-actuelle',
  );

  const url = new URL(baseUrl);
  url.search = params.toString();
  const response = await fetch(url);

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage('Unexpected response from geo.api.gouv.fr for cities');
    });
    return [];
  }

  return response.json();
};

const getClubsActivitiesBatch = async (
  limit: number,
  offset: number,
): Promise<ActivityResponse> => {
  const API_KEY = process.env.OPENDATASOFT_API_KEY;

  if (!API_KEY) {
    console.error(
      'OpenDatasoft api key is missing. Please provide it in OPENDATASOFT_API_KEY environment variable',
    );
    throw new Error('api key not provided');
  }

  const baseUrl =
    'https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/records';
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  params.append('group_by', 'activites');
  params.append('order_by', 'activites ASC');

  const url = new URL(baseUrl);
  url.search = params.toString();

  const headers = new Headers();
  headers.append('Authorization', `Apikey ${API_KEY}`);

  const response = await fetch(url, { next: { revalidate: 300 }, headers });

  if (!response.ok) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', response.body);
      scope.setExtra('responseStatus', response.status);
      scope.captureMessage(
        'Unexpected response from sports-sgsocialgouv.opendatasoft.com for activities',
      );
    });
    throw new Error('Error fetching activities');
  }

  return response.json();
};

export const getAllClubActivities = async (): Promise<ActivityResponse> => {
  const limit = 100;
  let offset = 0;
  let activities: ActivityResponse = { results: [] };
  let keepLooping = true;

  while (activities.results.length % limit === 0 && keepLooping) {
    try {
      const activitiesBatch = (await getClubsActivitiesBatch(limit, offset)).results;
      activities.results = activities.results.concat(activitiesBatch);
      offset += limit;
    } catch (e) {
      keepLooping = false;
    }
  }

  return activities;
};
