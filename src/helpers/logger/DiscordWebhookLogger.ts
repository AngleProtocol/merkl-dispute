import { DisputeContext } from '../../bot/context';
import { DisputeError } from '../../bot/errors';
import { MerklReport } from '../../types/bot';
import { sendDiscordNotification } from '../../utils/discord';
import Logger from './Logger';

function fieldsFromReport(report?: MerklReport) {
  return [
    {
      name: 'gist',
      value: `${report?.diffTableUrl ?? 'unavailable'}`,
    },
    {
      name: 'roots',
      value: `${report?.startRoot ?? 'unavailable'}\n${report?.endRoot ?? 'unavailable'}`,
    },
    {
      name: 'block',
      inline: true,
      value: report?.blockNumber?.toString() ?? 'unavailable',
    },
    {
      name: 'startEpoch',
      value: report?.startEpoch?.toString() ?? 'unavailable',
      inline: true,
    },
    {
      name: 'endEpoch',
      value: report?.endEpoch?.toString() ?? 'unavailable',
      inline: true,
    },
  ];
}

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

  override error = async (context: DisputeContext, reason: string, code?: number, report?: MerklReport) => {
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

    try {
      await sendDiscordNotification({
        title: errorTitles[code],
        description: reason,
        isAlert: true,
        severity: 'error',
        fields: fieldsFromReport(report),
        key: 'merkl dispute bot',
        chain: context.chainId,
      });
    } catch (err) {
      console.log('Failed to send error discord notification:', err);
    }
  };

  override success = async (context: DisputeContext, reason: string, report?: MerklReport) => {
    try {
      await sendDiscordNotification({
        title: `🎉 Nothing to report \n`,
        description: 'I checked the merkle root update and found no anomalies',
        isAlert: false,
        severity: 'success',
        fields: fieldsFromReport(report),
        key: 'merkl dispute bot',
        chain: context.chainId,
      });
    } catch (err) {
      console.log('Failed to send success discord notification:', err);
    }
  };
}
