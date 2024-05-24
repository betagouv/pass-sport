export const buildLCAConfirmUrl = (formData: FormData): URL => {
  const domain = process.env.NEXT_PUBLIC_LCA_API_URL;

  if (!domain) {
    throw new Error('Error: NEXT_PUBLIC_LCA_API_URL is not set');
  }

  const params = new URLSearchParams();
  params.append('id', formData.get('id') as string);
  params.append('situation', formData.get('situation') as string);
  params.append('organisme', formData.get('organisme') as string);

  const allocataireName = formData.get('recipientLastname') as string;
  if (allocataireName) {
    params.append('allocataireName', allocataireName);
  }

  const allocataireSurname = formData.get('recipientFirstname') as string;
  if (allocataireSurname) {
    params.append('allocataireSurname', allocataireSurname);
  }

  const matricule = formData.get('recipientCafNumber') as string;
  if (matricule) {
    params.append('matricule', matricule);
  }

  const recipientBirthPlace = formData.get('recipientBirthPlace') as string;
  if (recipientBirthPlace) {
    params.append('codeInseeBirth', recipientBirthPlace);
  }

  const recipientBirthDate = formData.get('recipientBirthDate') as string;
  if (recipientBirthDate) {
    params.append('allocataireBirthDate', recipientBirthDate);
  }

  const recipientBirthCountry = formData.get('recipientBirthCountry') as string;
  if (recipientBirthCountry) {
    params.append('codeIso', recipientBirthCountry);
  }

  const baseUrl = `${domain}/gw/psp-server/beneficiaires/confirm`;
  const url = new URL(baseUrl);
  url.search = params.toString();

  return url;
};
