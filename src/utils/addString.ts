import { BigNumber } from 'ethers';

export const addStrings = (a, b): string => BigNumber.from(a).add(b).toString();

export const subStrings = (a, b): string => BigNumber.from(a).sub(b).toString();

export const gtStrings = (a, b): boolean => BigNumber.from(a).gt(b);
