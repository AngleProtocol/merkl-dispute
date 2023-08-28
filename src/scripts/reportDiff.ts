import { ChainId } from '@angleprotocol/sdk';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.ARBITRUM;

/**
 *  If MODE == LOCAL you need to fill `./jsons/start.json` and `./jsons/end.json`
 *
 *  If MODE == DISTANT you need to fill `startTimestamp` and `endTimestamp` and jsons will be fetch from github
 *  main branch
 */
const params: ReportDiffParams = {
  MODE: 'LAST',
};

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportDiff, ReportDiffParams } from './diff';

reportDiff(chainId, params);
