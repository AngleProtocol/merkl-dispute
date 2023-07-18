import { gql } from 'graphql-request';

import { BATCH_NUMBER } from '../constants';

export const wrapperQuery = gql`
  query Query($poolId: ID!) {
    pool(id: $poolId) {
      arrakisPools
      gammaPools
    }
  }
`;

export const vaultQuery = gql`
  query Vaults($poolId: String!) {
    vaults(where: { pool: $poolId }) {
      id
    }
  }
`;

export const swapQuery = gql`
  query getSwaps($pool: String!, $uTimestamp: BigInt!, $lTimestamp: BigInt!, $first: Int!) {
    swaps(
      where: { pool_: { id: $pool }, timestamp_gt: $lTimestamp, timestamp_lt: $uTimestamp }
      orderBy: amount0
      orderDirection: desc
      first: $first
    ) {
      timestamp
      amount0
      amount1
      amountUSD
      tick
      sqrtPriceX96
      transaction {
        blockNumber
      }
    }
  }
`;

export const swapQueryUniV3 = gql`
  query Swaps($pool: String!, $uTimestamp: BigInt!, $lTimestamp: BigInt!, $first: Int!) {
    swaps(
      where: { pool_: { id: $pool }, timestamp_gt: $lTimestamp, timestamp_lt: $uTimestamp }
      orderBy: amount0
      orderDirection: desc
      first: $first
    ) {
      timestamp
      amount0
      amount1
      amountUSD
      tick
      sqrtPriceX96
      transaction {
        blockNumber
      }
    }
  }
`;

export const nftPositionsQuery = gql`
  query Positions($pool: String!, $minLiquidityOpen: BigInt!, $minLiquidityClosed: BigInt!, $startTimestamp: Int!) {
    openPositions: nftpositions(
      where: { pool_: { id: $pool }, endTimestamp: 0, liquidity_lt: $minLiquidityOpen },
      first: ${BATCH_NUMBER}
      orderBy: liquidity
      orderDirection: desc
    ) {
      endTimestamp,
      liquidity
      id
      owner
      startTimestamp, 
      liquidity,
      tickLower, 
      tickUpper,
    }
    closedPositions: nftpositions(
      where: { pool_: { id: $pool }, endTimestamp_gt: $startTimestamp, liquidity_lt: $minLiquidityClosed},
      first: ${BATCH_NUMBER} 
      orderBy: liquidity
      orderDirection: desc
    ) {
        endTimestamp,
        id
        owner
        startTimestamp, 
        liquidity,
        tickLower, 
        tickUpper,
      }
    }`;

export const directPositionsQuery = gql`
    query Positions($pool: String!, $minLiquidityOpen: BigInt!, $minLiquidityClosed: BigInt!, $startTimestamp: Int!) {
      openPositions: directPositions(
        where: { pool_: { id: $pool }, endTimestamp: 0, liquidity_lt: $minLiquidityOpen },
        first: ${BATCH_NUMBER}
        orderBy: liquidity
        orderDirection: desc
      ) {
        endTimestamp,
        owner
        startTimestamp, 
        id,
        tickLower, 
        tickUpper,
        liquidity
      }
      closedPositions: directPositions(
        where: { pool_: { id: $pool }, endTimestamp_gt: $startTimestamp, liquidity_lt: $minLiquidityClosed },
        first: ${BATCH_NUMBER} 
        orderBy: liquidity
        orderDirection: desc
      ) {
        endTimestamp,
        id
        owner
        startTimestamp, 
        liquidity,
      }
    }`;

export const holdersQuery = gql`
    query Holders($where: [Int!], $token: String!, $skip: Int!) {
      holders(where: { week_in: $where, token: $token }, first: ${BATCH_NUMBER}, skip: $skip) {
        holder
      }
    }
  `;
