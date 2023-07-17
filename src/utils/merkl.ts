import { Int256, MerklRewardDistributionType } from '@angleprotocol/sdk';
import { utils } from 'ethers';

export const log = (key: string, message: string) => {
  !!key ? console.log(`>>> [${!!utils.isHexString(key) ? key.slice(2, 20) : key}]: ` + message) : console.log(`>>> []: ` + message);
};

export function computeAccumulatedRewardSinceInception(rewards: MerklRewardDistributionType): string {
  const holders = rewards.holders;
  const tokenDecimals = rewards.tokenDecimals;
  let accumlatedSinceInception = Int256.parse(0, tokenDecimals);
  if (!!holders && Object.keys(holders).length > 0) {
    Object.keys(holders).forEach((holder) => {
      accumlatedSinceInception = accumlatedSinceInception.add(Int256.from(holders[holder].amount, tokenDecimals));
    });
  }
  return accumlatedSinceInception.raw.toString();
}
