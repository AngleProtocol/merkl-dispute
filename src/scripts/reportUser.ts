import { ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.POLYGON;
const user = '0xeB4a0896913f92987F61FBC2565dE4B0dA005Dc2';
const startTimestamp = moment().subtract(3, 'day').unix();
const endTimestamp = moment().subtract(1, 'day').unix();
const pool = '0x22c10e61A05a03bcd8BF61a7E648f2330ecdA270';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportUser } from './user';

reportUser(chainId, user, startTimestamp, endTimestamp, pool);
