import { Schema } from 'effect';

/**
 * Provisional shape of `projects.json`. `additionalDirectories` holds a directory Project's default Additional directories
 * by Project path; a Project with none has no key (the field is absent when no Project has any).
 */
export const ProjectsDocumentSchema = Schema.Struct({
  additionalDirectories: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  projects: Schema.Array(Schema.String),
});
export type ProjectsDocument = typeof ProjectsDocumentSchema.Type;
export const emptyProjects: ProjectsDocument = { projects: [] };
export const ProjectsDocumentJsonString = Schema.fromJsonString(ProjectsDocumentSchema, { space: 2 });
