import { DisputeContext } from './context';
import triggerDispute from './dispute';
import checkUpOnMerkl from './runner';

export default async function start(context: DisputeContext) {
  const checkUpResult = await checkUpOnMerkl(context);

  if (checkUpResult.err) {
    const disputeResult = await triggerDispute();
  } else {
    console.log('success');
  }
}
