/**
 * @jest-environment node
 */

import { fetchCode } from '@/app/services/eligibility-test';
import { POST } from '@/app/v2/api/eligibility-test/confirm/route';
import { buildConfirmResponseBody } from '../../../helpers/builders/confirm-response-body';
import { EnhancedConfirmResponseBody } from 'types/EligibilityTest';

jest.mock('../../../../src/app/services/eligibility-test', () => {
  const original = jest.requireActual('../../../../src/app/services/eligibility-test');
  return {
    ...original,
    fetchCode: jest.fn(),
  };
});

describe('POST /eligibility-test/confirm', () => {
  const badRequestTests = [
    {
      msg: 'id is not provided',
      data: [
        { key: 'situation', value: 'jeune' },
        { key: 'organisme', value: 'CAF' },
      ],
    },
    {
      msg: 'situation is not provided',
      data: [
        { key: 'id', value: '1' },
        { key: 'organisme', value: 'CAF' },
      ],
    },
    {
      msg: 'situation is not valid',
      data: [
        { key: 'id', value: '1' },
        { key: 'organisme', value: 'CAF' },
        { key: 'situation', value: 'something' },
      ],
    },
    {
      msg: 'organism is not provided',
      data: [
        { key: 'id', value: '1' },
        { key: 'situation', value: 'jeune' },
      ],
    },
    {
      msg: 'organism is not valid',
      data: [
        { key: 'id', value: '1' },
        { key: 'situation', value: 'jeune' },
        { key: 'organisme', value: 'something' },
      ],
    },
  ];

  it.each(badRequestTests)('return a 400 when $msg ', async ({ data }) => {
    const payload = new FormData();
    data.forEach((item) => {
      payload.append(item.key, item.value);
    });

    const request = new Request('http://localhost/api/eligibility-test/confirm', {
      method: 'POST',
      body: payload,
    });

    const response = await POST(request);
    expect(response.status).toEqual(400);
  });

  it('should return fetched data', async () => {
    const payload = new FormData();
    payload.append('id', '1');
    payload.append('situation', 'jeune');
    payload.append('organisme', 'CAF');

    const request = new Request('http://localhost/api/eligibility-test/confirm', {
      method: 'POST',
      body: payload,
    });

    const mockedFetchCode = fetchCode as jest.Mock;
    const mockedResponse: EnhancedConfirmResponseBody = [{ ...buildConfirmResponseBody({})[0] }];
    mockedFetchCode.mockResolvedValueOnce(mockedResponse);

    const response = await POST(request);
    expect(response.status).toEqual(200);
    const body = await response.json();
    expect(body).toMatchSnapshot();
  });

  it('should return an error 500 when LCA fetching throws', async () => {
    const payload = new FormData();
    payload.append('id', '1');
    payload.append('situation', 'jeune');
    payload.append('organisme', 'CAF');

    const request = new Request('http://localhost/api/eligibility-test/confirm', {
      method: 'POST',
      body: payload,
    });

    const mockedFetchCode = fetchCode as jest.Mock;
    mockedFetchCode.mockImplementationOnce(() => {
      throw new Error();
    });

    const response = await POST(request);
    expect(response.status).toEqual(500);
  });
});
