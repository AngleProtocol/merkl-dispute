import { DisputeContext } from "../../bot/run";
import { OnChainParams } from "../../providers/on-chain/OnChainProvider";

export default class Logger {
  context: (context: DisputeContext, timestamp?: number) => void;
  onChainParams: (params: OnChainParams) => void;
}
