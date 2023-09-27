import { utils } from 'ethers';

export const log = (key: string, message: string) => {
  !!key ? console.log(`>>> [${!!utils.isHexString(key) ? key.slice(2, 20) : key}]: ` + message) : console.log(`>>> []: ` + message);
};

export function linespace(start: number, end: number, card: number): number[] {
  const arr = [];
  const step = (end - start) / (card - 1);
  for (let i = 0; i < card; i++) {
    arr.push(start + step * i);
  }
  return arr;
}
