import { AMMType, ChainId } from '@angleprotocol/sdk';
import moment from 'moment';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    PARAMETERS                                                    
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

/** Algebra like pool */
// const chainId = ChainId.ARBITRUM;
// const alm = '0xD68B24270CfF87941a73E583d441724FD1F887a0';
// const almType = ALMType.Gamma;
// const startTimestamp = moment().subtract(5, 'day').unix();
// const endTimestamp = moment().subtract(2, 'day').unix();
// const nbrSteps = 2;
// const pool = '0xB1026b8e7276e7AC75410F1fcbbe21796e8f7526';

// /** Uniswap like pool */
const chainId = ChainId.ARBITRUM;
const pool = '0xc99be44383bc8d82357f5a1d9ae9976ee9d75bee';
const ammType = AMMType.Camelot;
const startTimestamp = moment().subtract(80, 'day').unix();
const endTimestamp = moment().subtract(1, 'day').unix();
/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportPool } from './pool';

reportPool(chainId, ammType, pool, startTimestamp, endTimestamp);
