import { DisputeError } from '../../bot/errors';
import { sendDiscordNotification } from '../../utils/discord';
import Logger from './Logger';

const chains = {
  137: 'Polygon',
  1: 'Ethereum',
  10: 'Optimism',
  42161: 'Arbitrum',
  pho: 'Polygon zvEVM',
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
    errorTitles[DisputeError.KeeperApprove] = '❌ TX ERROR on approve';
    errorTitles[DisputeError.KeerperDispute] = '❌ TX ERROR on disputeTree';
    errorTitles[DisputeError.KeeperInit] = '❌ Unable to init keeper wallet';
    errorTitles[DisputeError.TreeRoot] = '❌ Roots do not match';
    errorTitles[DisputeError.OnChainFetch] = '🔴 On-chain data unavailable';
    errorTitles[DisputeError.BlocktimeFetch] = '🔴 Block data unavailable';
    errorTitles[DisputeError.EpochFetch] = '🔴 Merkle root data unavailable';
    errorTitles[DisputeError.TreeFetch] = '🔴 Merkle tree data unavailable';
    errorTitles[DisputeError.NegativeDiff] = '🚸 Negative diff detected';
    errorTitles[DisputeError.AlreadyClaimed] = '🚸 Already claimed detected';

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
