'use client';

import { ContactRequestBody } from 'pages/api/contact';

export const postContact = async (request: FormData, isProRequest: boolean): Promise<Response> => {
  // type casting because at this point no value are null
  const body: ContactRequestBody = {
    email: request.get('email') as string,
    firstname: request.get('firstname') as string,
    lastname: request.get('lastname') as string,
    message: request.get('message') as string,
    reason: request.get('reason') as string,
    isProRequest,
  };

  const siret = request.get('siret') as string;

  if (siret) {
    body.siret = siret;
  }

  return fetch('/api/contact', { method: 'POST', body: JSON.stringify(body) });
};
