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
    throw new Error(`❌ Missing environment variable CHAINID`);
  }
  return parseInt(value) as ChainId;
}

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

export async function retryWithExponentialBackoff<T>(fn: (...any) => Promise<T>, retries = 5, delay = 500, ...args): Promise<T> {
  try {
    const result = await fn(...args);
    return result;
  } catch (error) {
    if (retries === 0) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithExponentialBackoff(fn, retries - 1, delay * 2, ...args);
  }
}
