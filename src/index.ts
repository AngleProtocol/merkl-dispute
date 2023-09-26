import { Command } from 'commander';
import { logger } from 'ethers';

import { defaultContext } from './bot/context';
import run from './bot/runner';
import diff from './diff';
import serve from './serve';

const bot = new Command();

bot.name('Merkl Dispute Bot').description('Bot safeguarding merkle root update for Merkl by Angle Labs').version('0.1');

bot.command('serve').description('Runs the bot as an express server, exposing /<chainId>/<blockNumber> route').action(serve);

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

bot
  .command('watch')
  .description('Runs the bot for every at a time interval')
  .option('-c, --chain <chainId>', 'ChainId to run the bot on')
  .option('-t, --time <timeInterval>', 'Time (in seconds) after which to retry running the bot')
  .action(async (str, options) => {
    const {
      _optionValues: { chain, time },
    } = options;

    const runBot = async () => {
      try {
        const context = defaultContext(parseInt(chain));

        await run(context);
      } catch (err) {
        console.error(err);
      }
    };

    runBot();

    setInterval(runBot, parseInt(time) * 1000);
  });

bot
  .command('diff')
  .description('Compares two timestamps and generate difference')
  .option('-c, --chain <chainId>', 'ChainId to run the bot on')
  .option('-f, --from <timestamp>', 'Timestamp to compare with <to>')
  .option('-t, --to <timestamp>', 'Timestamp to compare with <from>')
  .option('-g, --gist', 'Add if the output should be uploaded to a gist')
  .action(async (str, options) => {
    const {
      _optionValues: { chain, from, to, gist },
    } = options;

    const context = defaultContext(parseInt(chain));

    await diff(context, from, to, gist);
  });

bot.parse();
