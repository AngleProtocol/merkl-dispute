import { Command } from 'commander';

import { defaultContext } from './bot/context';
import run from './bot/run';

const bot = new Command();

bot.name('Merkl Dispute Bot').description('Bot safeguarding merkle root update for Merkl by Angle Labs').version('0.1');

bot
  .command('watch')
  .description('Runs the bot')
  .argument('<chainId>', 'ChainId to run the bot on')
  .action((str, options) => {
    const limit = options.first ? 1 : undefined;
    console.log(str.split(options.separator, limit));
  });

bot
  .command('run')
  .description('Runs the bot once')
  .option('-c, --chain <chainId>', 'ChainId to run the bot on')
  .option('-b, --block <blockNumber>', 'Block to run the bot on')
  .action(async (str, options) => {
    const {
      _optionValues: { chain, block },
    } = options;

    const context = defaultContext(parseInt(chain), !!block ? parseInt(block) : undefined);

    await run(context);
  });

bot.parse();
