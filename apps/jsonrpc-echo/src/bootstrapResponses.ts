const ECHO_AVAILABLE_COMMANDS = [
  { description: 'Replay a named fixture transcript.', name: '/fixture' },
  { description: 'Echo the prompt text back.', name: 'simple-reply' },
] as const;

export const echoInitializeResponse = (protocolVersion: number) => ({
  _meta: {
    goal: {
      actions: ['set', 'pause', 'resume', 'clear'],
      controlMethod: '_session/goal',
      version: 1,
    },
    steering: {
      supported: true,
    },
  },
  agentCapabilities: {
    auth: {
      logout: {},
    },
    loadSession: true,
    mcpCapabilities: {
      acp: false,
      http: true,
      sse: false,
    },
    promptCapabilities: {
      embeddedContext: true,
      image: true,
    },
    providers: {},
    sessionCapabilities: {
      additionalDirectories: {},
      close: {},
      delete: {},
      list: {},
      resume: {},
    },
  },
  agentInfo: {
    name: '@agentclientprotocol/jsonrpc-echo',
    title: 'Echo',
    version: '0.0.1',
  },
  authMethods: [],
  protocolVersion,
});

export const echoSessionNewResponse = (sessionId: string) => ({
  configOptions: [
    {
      category: 'model',
      currentValue: 'echo-model',
      description: 'Echo model',
      id: 'model',
      name: 'Model',
      options: [
        {
          description: 'Default echo model',
          name: 'Echo Model',
          value: 'echo-model',
        },
        {
          description: 'Verbose echo model',
          name: 'Echo Model (verbose)',
          value: 'echo-model-verbose',
        },
      ],
      type: 'select',
    },
    {
      category: 'mode',
      currentValue: 'default',
      description: 'Echo permission mode',
      id: 'mode',
      name: 'Mode',
      options: [
        {
          description: 'Standard echo behavior',
          name: 'Default',
          value: 'default',
        },
        {
          description: 'Fixture replay mode',
          name: 'Fixture',
          value: 'fixture',
        },
      ],
      type: 'select',
    },
  ],
  models: {
    availableModels: [
      {
        description: 'Default echo model',
        modelId: 'echo-model',
        name: 'Echo Model',
      },
      {
        description: 'Verbose echo model',
        modelId: 'echo-model-verbose',
        name: 'Echo Model (verbose)',
      },
    ],
    currentModelId: 'echo-model',
  },
  modes: {
    availableModes: [
      {
        description: 'Standard echo behavior',
        id: 'default',
        name: 'Default',
      },
      {
        description: 'Fixture replay mode',
        id: 'fixture',
        name: 'Fixture',
      },
    ],
    currentModeId: 'default',
  },
  sessionId,
});

export const echoSessionLoadResponse = (modeId: string, modelId: string) => {
  const base = echoSessionNewResponse('placeholder');
  return {
    configOptions: base.configOptions.map(option =>
      option.id === 'model'
        ? { ...option, currentValue: modelId }
        : option.id === 'mode'
          ? { ...option, currentValue: modeId }
          : option,
    ),
    modes: {
      ...base.modes,
      currentModeId: modeId,
    },
  };
};

export const echoAvailableCommandsUpdate = () => ({
  availableCommands: [...ECHO_AVAILABLE_COMMANDS],
  sessionUpdate: 'available_commands_update' as const,
});

export const echoSetModeResponse = (modeId: string) => ({
  configOptions: [
    {
      category: 'mode',
      currentValue: modeId,
      id: 'mode',
      name: 'Mode',
      type: 'select',
    },
  ],
});

export const echoSetConfigOptionResponse = (configId: string, value: string) => ({
  configOptions: [
    {
      category: configId,
      currentValue: value,
      id: configId,
      name: configId,
      type: 'select',
    },
  ],
});
