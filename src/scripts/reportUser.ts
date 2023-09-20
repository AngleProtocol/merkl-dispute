import { ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.POLYGON;
const user = '0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185';
const startTimestamp = moment().subtract(3, 'day').unix();
const endTimestamp = moment().subtract(1, 'day').unix();
const pool = '0x3Fa147D6309abeb5C1316f7d8a7d8bD023e0cd80';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportUser } from './user';

reportUser(chainId, user, startTimestamp, endTimestamp, pool);
