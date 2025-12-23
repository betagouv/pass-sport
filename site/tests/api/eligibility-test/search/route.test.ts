/**
 * @jest-environment node
 */

import { fetchEligible } from '@/app/services/eligibility-test';
import { POST } from '@/app/v2/api/eligibility-test/search/route';
import { buildSearchResponseBody } from '../../../helpers/builders/confirm-response-body';
import { SearchResponseBody } from 'types/EligibilityTest';

jest.mock('../../../../src/app/services/eligibility-test', () => {
  const original = jest.requireActual('../../../../src/app/services/eligibility-test');
  return {
    ...original,
    fetchEligible: jest.fn(),
  };
});

describe('POST /eligibility-test/search', () => {
  const badRequestTests = [
    {
      msg: 'beneficiaryLastname is not provided',
      data: [
        { key: 'beneficiaryFirstname', value: 'bob' },
        { key: 'beneficiaryBirthDate', value: '2015-03-28' },
        { key: 'recipientResidencePlace', value: '05024' },
      ],
    },
    {
      msg: 'beneficiaryFirstname is not provided',
      data: [
        { key: 'beneficiaryLastname', value: 'marley' },
        { key: 'beneficiaryBirthDate', value: '2015-03-28' },
        { key: 'recipientResidencePlace', value: '05024' },
      ],
    },
    {
      msg: 'beneficiaryBirthDate is not provided',
      data: [
        { key: 'beneficiaryFirstname', value: 'bob' },
        { key: 'beneficiaryLastname', value: 'marley' },
        { key: 'recipientResidencePlace', value: '05024' },
      ],
    },
    {
      msg: 'recipientResidencePlace is not provided',
      data: [
        { key: 'beneficiaryFirstname', value: 'bob' },
        { key: 'beneficiaryLastname', value: 'marley' },
        { key: 'beneficiaryBirthDate', value: '2015-03-28' },
      ],
    },
  ];

  it.each(badRequestTests)('return a 400 when $msg ', async ({ data }) => {
    const payload = new FormData();
    data.forEach((item) => {
      payload.append(item.key, item.value);
    });

    const request = new Request('http://localhost/api/eligibility-test/search', {
      method: 'POST',
      body: payload,
    });

    const response = await POST(request);
    expect(response.status).toEqual(400);
  });

  it('should return fetched data', async () => {
    const payload = new FormData();
    payload.append('beneficiaryLastname', 'DUPOND');
    payload.append('beneficiaryFirstname', 'MANON');
    payload.append('beneficiaryBirthDate', '2011-01-01');
    payload.append('recipientResidencePlace', '05024');

    const request = new Request('http://localhost/api/eligibility-test/search', {
      method: 'POST',
      body: payload,
    });

    const mockedFetchEligible = fetchEligible as jest.Mock;
    const mockedResponse: SearchResponseBody = [{ ...buildSearchResponseBody()[0] }];
    mockedFetchEligible.mockResolvedValueOnce(mockedResponse);

    const response = await POST(request);
    expect(response.status).toEqual(200);
    const body = await response.json();
    expect(body).toMatchSnapshot();
  });

  it('should return an error 500 when LCA fetching throws', async () => {
    const payload = new FormData();
    payload.append('beneficiaryLastname', 'DUPOND');
    payload.append('beneficiaryFirstname', 'MANON');
    payload.append('beneficiaryBirthDate', '2011-01-01');
    payload.append('recipientResidencePlace', '05024');

    const request = new Request('http://localhost/api/eligibility-test/search', {
      method: 'POST',
      body: payload,
    });

    const response = await POST(request);
    expect(response.status).toEqual(500);
  });
});
