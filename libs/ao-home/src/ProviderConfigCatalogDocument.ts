import { Schema } from 'effect';

const CatalogChoiceSchema = Schema.Struct({
  description: Schema.optionalKey(Schema.String),
  id: Schema.String,
  name: Schema.String,
});

const CatalogEntrySchema = Schema.Struct({
  category: Schema.optionalKey(Schema.String),
  choices: Schema.Array(CatalogChoiceSchema),
  description: Schema.optionalKey(Schema.String),
  id: Schema.String,
  name: Schema.String,
});

/** On-disk shape for `harness/<launchTarget>/provider-config-catalog.json`. */
export const ProviderConfigCatalogDocumentSchema = Schema.Struct({
  catalog: Schema.Array(CatalogEntrySchema),
});

export type ProviderConfigCatalogDocument = typeof ProviderConfigCatalogDocumentSchema.Type;
export type ProviderConfigCatalogEntry = typeof CatalogEntrySchema.Type;

export const ProviderConfigCatalogDocumentJsonString = Schema.fromJsonString(ProviderConfigCatalogDocumentSchema, {
  space: 2,
});
