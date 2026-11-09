import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { ensureHome } from './home.ts';

/** Missing file or undecodable content → `None`; other IO errors propagate. */
export const readJsonFile = <A>(filePath: string, codec: Schema.Codec<A, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    if (!(yield* fs.exists(filePath))) return Option.none<A>();
    return yield* Schema.decodeEffect(codec)(yield* fs.readFileString(filePath)).pipe(
      Effect.map(Option.some),
      Effect.catchTag('SchemaError', () => Effect.succeed(Option.none<A>())),
    );
  });

export const writeJsonFile = <A>(filePath: string, codec: Schema.Codec<A, string>, document: A) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    yield* ensureHome();
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    const encoded = yield* Schema.encodeEffect(codec)(document);
    yield* fs.writeFileString(filePath, encoded.endsWith('\n') ? encoded : `${encoded}\n`);
  });
