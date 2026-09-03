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
    {
      category: 'thought_level',
      currentValue: 'medium',
      description: 'How much reasoning effort the model should use',
      id: 'reasoning_effort',
      name: 'Reasoning effort',
      options: [
        {
          description: 'Fast responses with lighter reasoning',
          name: 'Low',
          value: 'low',
        },
        {
          description: 'Balances speed and reasoning depth',
          name: 'Medium',
          value: 'medium',
        },
        {
          description: 'Greater reasoning depth for complex problems',
          name: 'High',
          value: 'high',
        },
      ],
      type: 'select',
    },
  ],
  sessionId,
});

export const echoSessionLoadResponse = (modeId: string, modelId: string, reasoningEffortId: string) => {
  const currentValues: Record<string, string> = {
    mode: modeId,
    model: modelId,
    reasoning_effort: reasoningEffortId,
  };
  const base = echoSessionNewResponse('placeholder');
  return {
    configOptions: base.configOptions.map(option => ({
      ...option,
      currentValue: currentValues[option.id] ?? option.currentValue,
    })),
    sessionId: base.sessionId,
  };
};

export const echoAvailableCommandsUpdate = () => ({
  availableCommands: [...ECHO_AVAILABLE_COMMANDS],
  sessionUpdate: 'available_commands_update' as const,
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
