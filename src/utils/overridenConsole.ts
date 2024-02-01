import { Console } from 'console';
import { Transform } from 'stream';

export const overridenConsoleRead = new Transform({
  transform(chunk, _, cb) {
    cb(null, chunk);
  },
});
export const overridenConsole = new Console({ stdout: overridenConsoleRead });
