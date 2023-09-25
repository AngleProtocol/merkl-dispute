import { ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

const chainId = ChainId.ARBITRUM;
const user = '0xCEBc19601F3a379C9412959762C8216083D97563';
const startTimestamp = moment().subtract(3, 'day').unix();
const endTimestamp = moment().subtract(1, 'day').unix();
const pool = '0xB1026b8e7276e7AC75410F1fcbbe21796e8f7526';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportUser } from './user';

reportUser(chainId, user, startTimestamp, endTimestamp, pool);
