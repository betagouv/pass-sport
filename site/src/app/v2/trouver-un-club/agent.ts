import { City } from 'types/City';
import { ActivityResponse, SportGouvJSONResponse } from 'types/Club';
import { GeoGouvRegion } from 'types/Region';

export interface SqlSearchParams {
  clubName?: string;
  regionCode?: string;
  city?: string;
  postalCode?: string;
  activity?: string;
  disability?: string;
  limit?: number;
  offset: number;
}

export const getClubs = async (param: SqlSearchParams): Promise<SportGouvJSONResponse> => {
  const baseUrl =
    'https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/records';

  const params: URLSearchParams = new URLSearchParams();
  params.append('limit', param.limit ? param.limit.toString() : '20');
  params.append('offset', param.offset.toString());

  let whereClause = 'nom is not null';
  whereClause += param?.clubName ? ` AND ${param.clubName}` : '';
  whereClause += param?.regionCode ? ` AND ${param.regionCode}` : '';
  whereClause += param?.city ? ` AND ${param.city}` : '';
  whereClause += param?.postalCode ? ` AND ${param.postalCode}` : '';
  whereClause += param?.activity ? ` AND ${param.activity}` : '';
  whereClause += param?.disability ? ` AND ${param.disability}` : '';
  params.append('where', whereClause);

  const url = new URL(baseUrl);
  url.search = params.toString();
  const response = await fetch(url);

  if (!response.ok) {
    console.error('Status from sports-sgsocialgouv.opendatasoft.com: ' + response.status);
    console.error(response.body);
    return {
      results: [],
      total_count: 0,
    };
  }

  return response.json();
};

export const getFranceRegions = async (): Promise<GeoGouvRegion[]> => {
  const url = 'https://geo.api.gouv.fr/regions';

  const response = await fetch(url);

  if (!response.ok) {
    console.error('Error fetching regions. Status from geo.api.gouv.fr: ' + response.status);
    console.error(response.body);
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
    console.error('Error fetching cties. Status from geo.api.gouv.fr: ' + response.status);
    console.error(response.body);
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
    console.error(
      'Error fetching activities. Status from /sports-sgsocialgouv.opendatasoft.com: ' +
        response.status,
    );
    console.error(response.body);
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
