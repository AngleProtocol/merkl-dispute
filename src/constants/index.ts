export const TVL_THRESHOLD = 10;
export const BATCH_NUMBER = 1_000;
export const MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
export const GITHUB_URL = `https://raw.githubusercontent.com/AngleProtocol/merkl-rewards/main/`; // TODO switch to public gcloud buckets
export const ANGLE_API = `https://api.angle.money/`;
export const MAX_NUM_SUBCALLS = 20;
export const HOUR = 3600;
export const YEAR = 3600 * 24 * 365;
export const MERKL_TREE_OPTIONS = { hashLeaves: false, sortLeaves: true, sortPairs: true };

export const ALLOWED_OVER_CLAIM = [
  '0x7A42A8274f7b2687c7A583A388d5e56d2987A3f6',
  '0x3f9763cE4F230368437f45CE81Be598c253Db338',
  '0x2A6Be69cd729288006f831737D5032f15626d52c',
];

export const MERKL_API_URL = process.env.MERKL_API_URL ? process.env.MERKL_API_URL : "https://api-staging.angle.money/v3";
