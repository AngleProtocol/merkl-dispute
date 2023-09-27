import { Octokit } from '@octokit/rest';
import { Console } from 'console';
import { Transform } from 'stream';

import { MerklReport } from '../types/bot';
import { round } from '.';
import { DistributionChange, DistributionChanges, HolderDetail } from '../types/holders';

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

export default async function createDiffTable(details: HolderDetail[], changePerDistrib: DistributionChanges, local = true) {
  try {
    const ts = new Transform({
      transform(chunk, _, cb) {
        cb(null, chunk);
      },
    });
    const output = local ? console : new Console({ stdout: ts });

    output.table(details, [
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

    output.table(
      Object.keys(changePerDistrib)
        .map((k) => {
          return { ...changePerDistrib[k], epoch: round(changePerDistrib[k].epoch, 4) };
        })
        .sort((a, b) => (a.poolName > b.poolName ? 1 : b.poolName > a.poolName ? -1 : 0))
    );

    if (local) return undefined;

    return await createGist('A gist', (ts.read() || '').toString());
  } catch (err) {
    return undefined;
  }
}
