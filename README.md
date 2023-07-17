# Merkl algorithm for incentivizing Liquidity Providers


This repository contains an implementation of the Merkl algorithm for incentivizing liquidity providers. The Merkl algorithm is designed to reward liquidity providers based on their contribution to a decentralized liquidity pool.

## Setup
To set up the project, please follow these steps:

1. Install dependencies by running the following command:
`yarn`

2. Fill in the required environment variables by creating a `.env` file based on the provided `.env.example` file.

3. Launch the express server by running the following command:
`yarn run-[network]`
For example, to launch the server on the mainnet, run:
`yarn run-mainnet`

## Testing Merkl

- Merkl parameters such as the max number of swaps to consider `MAX_SWAPS_TO_CONSIDER` can be changed in `src/constants/index.ts`.
- Once the server is running, you can trigger the Merkl algorithm by making a request to `localhost:5002/` in your web browser or using any other HTTP client.
- If you need to manually handle the filtering of distributions, you can find the relevant code in the `src/routes/merkl.ts` file, specifically on line 65.