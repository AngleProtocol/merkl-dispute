import 'dotenv/config';

import { ChainId, EnvType } from '@angleprotocol/sdk';
import { Octokit } from '@octokit/rest';

export function getEnv(): EnvType {
  const value = process.env['ENV'] as EnvType;
  if (!value) {
    throw new Error(`❌ Missing environment variable ENV`);
  }
  return value;
}

export function getChainId(): ChainId {
  const value = process.env['CHAINID'];
  if (!value) {
    throw new Error(`❌ Missing environment variable ENV`);
  }
  return parseInt(value) as ChainId;
}
const octokit = new Octokit({ auth: process.env.KEEPER_GITHUB_AUTH_TOKEN });

export async function createGist(content: string): Promise<void> {
  try {
    const response = await octokit.gists.create({
      files: {
        'diff.txt': {
          content: content,
        },
      },
      description: 'This is a sample gist',
      public: false,
    });

    console.log('Gist created: ' + response.data.html_url);
  } catch (error) {
    console.error('Error creating gist:', error);
  }
}
