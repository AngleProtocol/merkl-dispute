import { DisputeContext } from '../../bot/context';
import { BotError, MerklReport } from '../../types/bot';
import { sendDiscordNotification } from '../../utils/discord';
import Logger from './Logger';

function fieldsFromReport(report?: MerklReport) {
  const fields = [];

  report?.diffTableUrl &&
    fields.push({
      name: 'gist',
      value: `${report?.diffTableUrl}`,
    });

  report?.startRoot &&
    report?.startRoot &&
    fields.push({
      name: 'roots',
      value: `${report?.startRoot}\n${report?.endRoot}`,
    });

  report?.blockNumber?.toString() &&
    fields.push({
      name: 'block',
      inline: true,
      value: `${report?.blockNumber?.toString()}`,
    });

  report?.startEpoch?.toString() &&
    fields.push({
      name: 'startEpoch',
      inline: true,
      value: `${report?.startEpoch?.toString()}`,
    });

  report?.endEpoch?.toString() &&
    fields.push({
      name: 'endEpoch',
      inline: true,
      value: `${report?.endEpoch?.toString()}`,
    });

  return fields;
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
    errorTitles[BotError.AlertDelay] = '🚸 Last update too far ago';

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
        description: reason,
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
