import { CHATBOT_IS_ACTIVATED } from '@/app/constants/env';

export const formatDate = (inputDate: string) => {
  const date = new Date(inputDate);

  const dayAsNumber = date.getDate();
  const day = dayAsNumber < 10 ? `0${dayAsNumber.toString()}` : dayAsNumber.toString();

  let monthAsNumber = date.getMonth() + 1;
  const month = monthAsNumber < 10 ? `0${monthAsNumber.toString()}` : monthAsNumber.toString();
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

export const getAnHourFromNow = () => {
  return new Date(Date.now() + 60 * 60 * 1000);
};

export const isPasSportClosed = () => {
  // const currentDate = new Date();
  // const cutOffDate = new Date('2026-12-31T23:01:00Z'); // 00H01 January 1st 2027
  //
  // return currentDate >= cutOffDate;
  return process.env.NEXT_PUBLIC_PASS_SPORT_IS_CLOSED === 'yes';
};

export const displayOfficialClosingBanner = () => {
  // const currentDate = new Date();
  // const cutOffDate = new Date('2026-01-15T23:01:00Z'); // 00H01 January 16th 2026
  //
  // return currentDate >= cutOffDate;
  return process.env.NEXT_PUBLIC_PASS_SPORT_DISPLAY_OFFICIEL_CLOSING_BANNER === 'yes';
};

export const shouldDisplayChatbot = () => {
  return CHATBOT_IS_ACTIVATED;
};
