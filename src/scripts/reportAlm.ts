import { ALMType, ChainId } from '@angleprotocol/sdk';
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
const chainId = ChainId.POLYGON;
const alm = '0x64e14623CA543b540d0bA80477977f7c2c00a7Ea';
const almType = ALMType.Gamma;
const startTimestamp = moment().subtract(10, 'day').unix();
const endTimestamp = moment().subtract(1, 'day').unix();
const nbrSteps = 6;
const pool = '0x619259F699839dD1498FFC22297044462483bD27';

/*//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                                              END OF PARAMETERS                                                
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/

import { reportGlobalChainAlm, reportHistoricalPoolAPRAlm, reportPoolAlm } from './alm';

// reportGlobalChainAlm(chainId, almType, startTimestamp, endTimestamp);
// reportPoolAlm(chainId, alm, almType, startTimestamp, endTimestamp, pool);
reportHistoricalPoolAPRAlm(chainId, alm, almType, startTimestamp, endTimestamp, nbrSteps, pool);
