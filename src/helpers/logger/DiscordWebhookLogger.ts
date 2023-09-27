import { DisputeContext } from '../../bot/context';
import { BotError, MerklReport } from '../../types/bot';
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

const noLog = () => {
  return;
};

export default class DiscordWebhookLogger extends Logger {
  override context = noLog;
  override onChainParams = noLog;
  override computedRoots = noLog;
  override trees = () => noLog;

  override error = async (context: DisputeContext, reason: string, code?: number, report?: MerklReport) => {
    const errorTitles = {};
    errorTitles[BotError.TreeRoot] = '❌ Roots do not match';
    errorTitles[BotError.OnChainFetch] = '🔴 On-chain data unavailable';
    errorTitles[BotError.BlocktimeFetch] = '🔴 Block data unavailable';
    errorTitles[BotError.EpochFetch] = '🔴 Merkle root data unavailable';
    errorTitles[BotError.TreeFetch] = '🔴 Merkle tree data unavailable';
    errorTitles[BotError.NegativeDiff] = '🚸 Negative diff detected';
    errorTitles[BotError.AlreadyClaimed] = '🚸 Already claimed detected';

    try {
      await sendDiscordNotification({
        title: errorTitles[code],
        description: reason,
        isAlert: true,
        severity: 'warning',
        fields: fieldsFromReport(report),
        key: 'merkl dispute bot',
        chain: context.chainId,
      });
    } catch (err) {
      console.log('Failed to send error discord notification:', err);
    }
  };

  override disputeError = async (context: DisputeContext, reason: string, code?: number, report?: MerklReport) => {
    const errorTitles = {};
    errorTitles[BotError.KeeperApprove] = '❌ Transaction failed (approve)';
    errorTitles[BotError.KeeperDispute] = '❌ Transaction failed (disputeTree)';
    errorTitles[BotError.KeeperCreate] = '❌ Signer creation failed';

    console.log('??', reason, errorTitles[code]);

    try {
      await sendDiscordNotification({
        title: errorTitles[code],
        description: reason ?? '',
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
        title: `✅ Nothing to report \n`,
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

  override disputeSuccess = async (context: DisputeContext, reason: string, report?: MerklReport) => {
    try {
      await sendDiscordNotification({
        title: `⚔️ Dispute Successful \n`,
        description: 'Anomalies found, a dispute has been triggered',
        isAlert: true,
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
