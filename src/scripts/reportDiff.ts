import { ChainId } from '@angleprotocol/sdk';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.POLYGON;

/**
 *  If MODE == LOCAL you need to fill `./jsons/start.json` and `./jsons/end.json`
 *
 *  If MODE == DISTANT you need to fill `startTimestamp` and `endTimestamp` and jsons will be fetch from github
 *  main branch
 */
const params:
  | {
      MODE: 'LOCAL';
    }
  | {
      MODE: 'TIMESTAMP';
      startTimestamp: number;
      endTimestamp: number;
    }
  | {
      MODE: 'ROOTS';
      startRoot: string;
      endRoot: string;
    } = {
  MODE: 'LOCAL',
};

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportDiff } from './diff';

reportDiff(chainId, params);
