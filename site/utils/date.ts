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
  const currentDate = new Date();
  const cutOffDate = new Date(2030, 0, 1);

  return currentDate >= cutOffDate;
};

export const shouldDisplayChatbot = () => {
  // todo: Update the date once we have more information
  const currentDate = new Date();
  const openDate = new Date(2030, 5, 10);

  return currentDate >= openDate;
};
