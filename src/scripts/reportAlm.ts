import { ALMType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

/** Algebra like pool */
const chainId = ChainId.ARBITRUM;
const alm = '0xD68B24270CfF87941a73E583d441724FD1F887a0';
const almType = ALMType.Gamma;
const startTimestamp = moment().subtract(5, 'day').unix();
const endTimestamp = moment().subtract(2, 'day').unix();
const pool = '0xB1026b8e7276e7AC75410F1fcbbe21796e8f7526';

// /** Uniswap like pool */
// const chainId = ChainId.POLYGON;
// const user = '0xfdA462548Ce04282f4B6D6619823a7C64Fdc0185';
// const startTimestamp = moment().subtract(3, 'day').unix();
// const endTimestamp = moment().subtract(1, 'day').unix();
// const pool = '0x3Fa147D6309abeb5C1316f7d8a7d8bD023e0cd80';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportAlm } from './alms';

reportAlm(chainId, alm, almType, startTimestamp, endTimestamp, pool);
