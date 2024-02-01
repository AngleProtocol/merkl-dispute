export const displayString = (str: string, decimals: number) => {
  return str.padStart(decimals + 1, '0').slice(0, -decimals) + '.' + str.padStart(19, '0').slice(-decimals);
};
