import { AggregatedRewardsType } from '@angleprotocol/sdk';
import chalk from 'chalk';
import { BigNumber } from 'ethers';

import { DisputeContext } from '../../bot/context';
import { OnChainParams } from '../../providers/on-chain/OnChainProvider';
import Logger from './Logger';
import {
  ERROR_FETCH_BLOCK_TIME,
  ERROR_FETCH_EPOCH,
  ERROR_FETCH_ONCHAIN,
  ERROR_FETCH_TREE,
  ERROR_KEEPER_APPROVE,
  ERROR_KEEPER_DISPUTE,
  ERROR_KEEPER_WALLET,
  ERROR_TREE_ALREADY_CLAIM,
  ERROR_TREE_NEGATIVE_DIFF,
  ERROR_TREE_ROOT,
} from '../../bot/errors';
import { sendDiscordNotification, severity } from '../../utils/discord';

const chains = {
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  1101: 'Polygon zvEVM',
};

export default class DiscordWebhookLogger extends Logger {
  override context = () => {
    return;
  };
  override onChainParams = () => {
    return;
  };
  override computedRoots = () => {
    return;
  };
  override trees = () => {
    return;
  };

  override error = async (reason: string, code?: number) => {
    const errorTitles = {};
    errorTitles[ERROR_KEEPER_APPROVE] = '❌ TX ERROR on approve';
    errorTitles[ERROR_KEEPER_DISPUTE] = '❌ TX ERROR on disputeTree';
    errorTitles[ERROR_KEEPER_WALLET] = '❌ Unable to init keeper wallet';
    errorTitles[ERROR_TREE_ROOT] = '❌ Roots do not match';
    errorTitles[ERROR_FETCH_ONCHAIN] = '🔴 On-chain data unavailable';
    errorTitles[ERROR_FETCH_BLOCK_TIME] = '🔴 Block data unavailable';
    errorTitles[ERROR_FETCH_EPOCH] = '🔴 Merkle root data unavailable';
    errorTitles[ERROR_FETCH_TREE] = '🔴 Merkle tree data unavailable';
    errorTitles[ERROR_TREE_NEGATIVE_DIFF] = '🚸 Negative diff detected';
    errorTitles[ERROR_TREE_ALREADY_CLAIM] = '🚸 Already claimed detected';

    await sendDiscordNotification({
      title: errorTitles[code],
      description: reason,
      isAlert: true,
      severity: 'error',
      fields: [],
      key: 'merkl dispute bot',
    });
  };

  override success = async (reason: string) => {
    await sendDiscordNotification({
      title: `🎉 SUCCESSFULLY disputed tree \n`,
      description: reason,
      isAlert: true,
      severity: 'warning',
      fields: [],
      key: 'merkl dispute bot',
    });
  };
}
