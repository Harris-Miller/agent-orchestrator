import {
  CreateElicitationFormRequest,
  ElicitationArrayProperty,
  ElicitationBooleanProperty,
  ElicitationIntegerProperty,
  ElicitationNumberProperty,
  ElicitationStringProperty,
} from '@libs/effect-acp';
import type { CreateElicitationRequestBody, ElicitationContent, ElicitationPropertySchema } from '@libs/effect-acp';
import { Schema } from 'effect';
import { useState } from 'react';
import type { FC } from 'react';

import { LabeledSelect } from '../LabeledSelect.tsx';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Input } from '../ui/input.tsx';

import { pendingRequestCardClass } from './PendingPermissionCard.tsx';

const SupportedFormProperty = Schema.Union([
  ElicitationStringProperty,
  ElicitationBooleanProperty,
  ElicitationNumberProperty,
  ElicitationIntegerProperty,
]);
type SupportedFormProperty = typeof SupportedFormProperty.Type;

const propertyEntries = (
  request: CreateElicitationFormRequest,
): readonly (readonly [string, ElicitationPropertySchema])[] => {
  const { properties } = request.requestedSchema;
  if (properties === undefined) {
    return [];
  }
  return Object.entries(properties);
};

const defaultValueFor = (property: SupportedFormProperty): boolean | number | string => {
  if (Schema.is(ElicitationBooleanProperty)(property)) {
    return property.default ?? false;
  }
  if (Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property)) {
    return property.default ?? 0;
  }
  if (property.default != null) {
    return property.default;
  }
  const firstEnum = property.enum?.[0];
  return firstEnum ?? '';
};

const unsupportedTypeLabel = (property: ElicitationPropertySchema): string => {
  if (Schema.is(ElicitationArrayProperty)(property)) {
    return property.type;
  }
  return 'unknown';
};

export const PendingElicitationCard: FC<{
  readonly agentTitle: string;
  readonly onAccept: (content: ElicitationContent) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly request: CreateElicitationRequestBody;
}> = ({ agentTitle, onAccept, onCancel, onDecline, request }) => {
  const formRequest = Schema.is(CreateElicitationFormRequest)(request) ? request : undefined;
  const entries = formRequest === undefined ? [] : propertyEntries(formRequest);

  const [values, setValues] = useState<Record<string, boolean | number | string>>(() => {
    const initial: Record<string, boolean | number | string> = {};
    for (const [name, property] of entries) {
      if (Schema.is(SupportedFormProperty)(property)) {
        initial[name] = defaultValueFor(property);
      }
    }
    return initial;
  });

  if (formRequest === undefined) {
    return (
      <div className={pendingRequestCardClass}>
        <p className="mb-2 text-sm font-medium">Unsupported elicitation from {agentTitle}</p>
        <div className="flex gap-2">
          <Button onClick={onDecline} size="sm" variant="outline">
            Decline
          </Button>
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={pendingRequestCardClass}>
      <p className="text-xs text-muted-foreground">{agentTitle} asks</p>
      <p className="mb-2 text-base font-medium">{formRequest.message}</p>
      <div className="mt-2 mb-4 flex flex-col gap-3">
        {entries.map(([name, property]) => {
          if (!Schema.is(SupportedFormProperty)(property)) {
            return (
              <p className="text-sm text-muted-foreground" key={name}>
                Unsupported field “{name}” (type {unsupportedTypeLabel(property)}) — decline or cancel.
              </p>
            );
          }

          const title = property.title ?? name;
          const description = property.description ?? undefined;

          if (Schema.is(ElicitationBooleanProperty)(property)) {
            return (
              <div className="flex items-center gap-2 text-sm" key={name}>
                <Checkbox
                  aria-labelledby={`elicit-${name}-label`}
                  checked={values[name] === true}
                  onCheckedChange={checked => {
                    setValues(current => ({ ...current, [name]: checked }));
                  }}
                />
                <button
                  className="cursor-pointer text-sm"
                  id={`elicit-${name}-label`}
                  onClick={() => {
                    setValues(current => ({ ...current, [name]: current[name] !== true }));
                  }}
                  type="button"
                >
                  {title}
                </button>
              </div>
            );
          }

          if (Schema.is(ElicitationStringProperty)(property) && property.enum != null) {
            const current = typeof values[name] === 'string' ? values[name] : '';
            return (
              <LabeledSelect
                id={`elicit-${name}`}
                key={name}
                label={title}
                labelClassName="text-sm font-medium text-foreground"
                onValueChange={value => {
                  setValues(currentValues => ({ ...currentValues, [name]: value }));
                }}
                options={property.enum.map(option => ({ label: option, value: option }))}
                value={current}
              />
            );
          }

          const numeric =
            Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property);

          return (
            <div key={name}>
              <span className="text-sm font-medium" id={`elicit-${name}-label`}>
                {title}
              </span>
              <Input
                aria-labelledby={`elicit-${name}-label`}
                className="mt-1.5"
                onChange={event => {
                  const raw = event.target.value;
                  if (numeric) {
                    const parsed = Number(raw);
                    setValues(currentValues => ({ ...currentValues, [name]: Number.isFinite(parsed) ? parsed : 0 }));
                    return;
                  }
                  setValues(currentValues => ({ ...currentValues, [name]: raw }));
                }}
                type={numeric ? 'number' : 'text'}
                value={typeof values[name] === 'boolean' ? '' : (values[name] ?? '')}
              />
              {description !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            onAccept(values);
          }}
          size="sm"
        >
          Accept
        </Button>
        <Button onClick={onDecline} size="sm" variant="outline">
          Decline
        </Button>
        <Button onClick={onCancel} size="sm" variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  );
};
