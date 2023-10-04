export type ExponentialFetchParams = {
  retries: number;
  delay: number;
  multiplier: number;
};

export abstract class ExponentialBackoffProvider {
  fetchParams: ExponentialFetchParams;

  protected async retryWithExponentialBackoff<T>(fn: (...params) => Promise<T>, fetchParams: ExponentialFetchParams, ...args): Promise<T> {
    const { retries, delay, multiplier } = fetchParams;

    try {
      return await fn(...args);
    } catch (err) {
      if (retries === 0) throw err;

      await new Promise((resolve) => setTimeout(resolve, delay));

      const nextParams: ExponentialFetchParams = {
        ...fetchParams,
        delay: fetchParams.delay * multiplier,
        retries: fetchParams.retries - 1,
      };

      return this.retryWithExponentialBackoff(fn, nextParams, ...args);
    }
  }

  constructor(fetchParams: ExponentialFetchParams = { retries: 5, delay: 500, multiplier: 2 }) {
    this.fetchParams = fetchParams;
  }
}
