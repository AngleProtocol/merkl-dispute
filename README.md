# Merkl Dispute bot

## How does it work?

The bot runs when a dispute period is ongoing and checks if the merkle root submitted on chain is correct.
If the data is incorrect or it is unable to fetch enough data to be able to make the checks, it will send a dispute.

![image](./docs/bot-decision-tree.png)

## What is a dispute ?

A dispute is a halt of the merkl root update on the contract, which allows the DAO to come in and resolve the conflict. 
This mechanism can prevent a malicious or accidental update of the new reward data which might be invalid.

![image](./docs/dispute-process.png)

## Pre-requisites

You must provide some neccesary envionrment variables:
```env
PORT: 5002
ENV: 'prod'

CHAINID= 1
KEEPER_GITHUB_AUTH_TOKEN= ""
DISPUTE_BOT_PRIVATE_KEY= ""
DISCORD_TOKEN= ""
PROVIDER_137= ""
PROVIDER_10= ""
PROVIDER_1= ""
PROVIDER_42161= ""
PROVIDER_1101= ""
```

## Run the bot

Install the dependencies and build the bot:

```bash
yarn install
yarn build
```

Run the bot periodically (recommended interval is 1 hour):

```bash
yarn bot watch --chain <chainId> --time <timeIntervalInSeconds>
```

You can also run the bot once to try to dispute the latest block or check the bot against a previous block:

```bash
yarn bot run --chain <chainId>
yarn bot run --chain <chainId> --block <blockNumber>
```
