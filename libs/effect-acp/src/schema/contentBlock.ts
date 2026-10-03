/**
 * Typed ACP ContentBlock union (text / resource_link / resource text|blob).
 * Opaque placeholders remain for image/audio until those prompt capabilities are wired.
 */
import { Schema } from 'effect';

import { MetaField, optional } from './common.ts';

export class TextContentBlock extends Schema.Opaque<TextContentBlock>()(
  Schema.Struct({
    _meta: MetaField,
    annotations: optional(Schema.Unknown),
    text: Schema.String,
    type: Schema.Literal('text'),
  }),
) {}

export class ResourceLinkContentBlock extends Schema.Opaque<ResourceLinkContentBlock>()(
  Schema.Struct({
    _meta: MetaField,
    annotations: optional(Schema.Unknown),
    description: optional(Schema.NullOr(Schema.String)),
    mimeType: optional(Schema.NullOr(Schema.String)),
    name: Schema.String,
    size: optional(Schema.NullOr(Schema.Number)),
    title: optional(Schema.NullOr(Schema.String)),
    type: Schema.Literal('resource_link'),
    uri: Schema.String,
  }),
) {}

export class TextResourceContents extends Schema.Opaque<TextResourceContents>()(
  Schema.Struct({
    _meta: MetaField,
    mimeType: optional(Schema.NullOr(Schema.String)),
    text: Schema.String,
    uri: Schema.String,
  }),
) {}

export class BlobResourceContents extends Schema.Opaque<BlobResourceContents>()(
  Schema.Struct({
    _meta: MetaField,
    blob: Schema.String,
    mimeType: optional(Schema.NullOr(Schema.String)),
    uri: Schema.String,
  }),
) {}

export class ResourceContentBlock extends Schema.Opaque<ResourceContentBlock>()(
  Schema.Struct({
    _meta: MetaField,
    annotations: optional(Schema.Unknown),
    resource: Schema.Union([TextResourceContents, BlobResourceContents]),
    type: Schema.Literal('resource'),
  }),
) {}

/** ACP ContentBlock — text, resource_link, and embedded resource (text/blob). */
export const ContentBlock = Schema.Union([TextContentBlock, ResourceLinkContentBlock, ResourceContentBlock]);
export type ContentBlock = typeof ContentBlock.Type;
