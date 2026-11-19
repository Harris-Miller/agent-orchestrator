import { Schema } from 'effect';

/** Provisional shape of `projects.json`. */
export const ProjectsDocumentSchema = Schema.Struct({ projects: Schema.Array(Schema.String) });
export type ProjectsDocument = typeof ProjectsDocumentSchema.Type;
export const emptyProjects: ProjectsDocument = { projects: [] };
export const ProjectsDocumentJsonString = Schema.fromJsonString(ProjectsDocumentSchema, { space: 2 });
