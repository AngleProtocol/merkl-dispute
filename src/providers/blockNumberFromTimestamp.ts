import { ChainId } from '@angleprotocol/sdk';
import axios from 'axios';

export const chainApiUrls = {
  [ChainId.ARBITRUM]: 'https://api.arbiscan.io',
  [ChainId.MAINNET]: 'https://api.etherscan.io',
  [ChainId.OPTIMISM]: 'https://api-optimistic.etherscan.io',
  [ChainId.POLYGON]: 'https://api.polygonscan.com',
  [ChainId.POLYGONZKEVM]: 'https://api-zkevm.polygonscan.com',
  [ChainId.AVALANCHE]: 'https://api.snowtrace.io',
  [ChainId.GNOSIS]: 'https://api.gnosisscan.io',
  [ChainId.BSC]: 'https://api.bscscan.com',
  [ChainId.CELO]: 'https://api.celoscan.io',
  [ChainId.BASE]: 'https://api.basescan.org',
};

export default async function blockFromTimestamp(timestamp: number, chainId: number) {
  const url = chainApiUrls[chainId];
  const response = await axios.get(
    url + `/api?module=block&action=getblocknobytime&timestamp=${timestamp.toString()}&closest=before&apikey=YourApiKeyToken`
  );
  return response.data.result;
}
