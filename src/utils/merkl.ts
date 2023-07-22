import { utils } from 'ethers';

export const log = (key: string, message: string) => {
  !!key ? console.log(`>>> [${!!utils.isHexString(key) ? key.slice(2, 20) : key}]: ` + message) : console.log(`>>> []: ` + message);
};
