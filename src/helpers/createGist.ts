import { Octokit } from '@octokit/rest';
import { Console } from 'console';
import { Transform } from 'stream';

import { DistributionChanges, HolderDetail } from '../bot/holder-checks';
import { round } from '.';

const octokit = new Octokit({ auth: process.env.KEEPER_GITHUB_AUTH_TOKEN });
export async function createGist(description: string, content: string): Promise<string> {
  const response = await octokit.gists.create({
    files: {
      'diff.txt': {
        content: content,
      },
    },
    description,
    public: false,
  });
  return response.data.html_url;
}

export default async function logTableToGist(details: HolderDetail[], changePerDistrib: DistributionChanges) {
  const ts = new Transform({
    transform(chunk, _, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });

  logger.table(details, [
    'holder',
    'diff',
    'symbol',
    'poolName',
    'distribution',
    'percent',
    'diffAverageBoost',
    'totalCumulated',
    'alreadyClaimed',
    'issueSpotted',
  ]);

  logger.table(
    Object.keys(changePerDistrib)
      .map((k) => {
        return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
      })
      .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
  );

  await createGist('A gist', (ts.read() || '').toString());
}
