/**
 * Typed ACP ContentBlock union (text / image / resource_link / resource text|blob).
 * Audio remains unwired until that prompt capability is needed.
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

export class ImageContentBlock extends Schema.Opaque<ImageContentBlock>()(
  Schema.Struct({
    _meta: MetaField,
    annotations: optional(Schema.Unknown),
    data: Schema.String,
    mimeType: Schema.String,
    type: Schema.Literal('image'),
    uri: optional(Schema.String),
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

/** ACP ContentBlock — text, image, resource_link, and embedded resource (text/blob). */
export const ContentBlock = Schema.Union([
  TextContentBlock,
  ImageContentBlock,
  ResourceLinkContentBlock,
  ResourceContentBlock,
]);
export type ContentBlock = typeof ContentBlock.Type;
