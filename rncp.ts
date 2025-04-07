// RNCP - Require No Context Protocol
// Core framework implementation

// ======= Types =======

interface DataSource {
    id: string;
    type: string;
    connect(): Promise<DataConnection>;
    getSchema(): Promise<Schema>;
    getMetadata(): Promise<Record<string, any>>;
  }
  
  interface DataConnection {
    query(query: string): Promise<any>;
    stream(query: string): AsyncIterableIterator<any>;
    close(): Promise<void>;
  }
  
  interface Schema {
    fields: SchemaField[];
    relationships?: SchemaRelationship[];
    description?: string;
  }
  
  interface SchemaField {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
  }
  
  interface SchemaRelationship {
    from: string;
    to: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    description?: string;
  }
  
  interface LLMProvider {
    id: string;
    call(params: LLMRequest): Promise<LLMResponse>;
    stream(params: LLMRequest): AsyncIterableIterator<LLMResponseChunk>;
    validateCapabilities(requirements: LLMCapabilityRequirement[]): boolean;
  }
  
  interface LLMRequest {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    format?: 'json' | 'text' | 'markdown';
    contextData?: Record<string, any>;
  }
  
  interface LLMResponse {
    content: string;
    format: 'json' | 'text' | 'markdown';
    parsedJson?: Record<string, any>;
    metadata: {
      tokenUsage: {
        input: number;
        output: number;
        total: number;
      };
      modelId: string;
      timestamp: number;
    };
  }
  
  interface LLMResponseChunk {
    content: string;
    isLast: boolean;
  }
  
  interface LLMCapabilityRequirement {
    feature: string;
    minLevel: number;
  }
  
  interface OutputSchema {
    type: 'object';
    properties: Record<string, OutputSchemaProperty>;
    required: string[];
  }
  
  interface OutputSchemaProperty {
    type: string;
    description?: string;
    enum?: string[];
    items?: OutputSchemaProperty;
    properties?: Record<string, OutputSchemaProperty>;
    required?: string[];
  }
  
  interface ActionDefinition {
    id: string;
    name: string;
    description: string;
    inputSchema: OutputSchema;
    execute(params: Record<string, any>): Promise<ActionResult>;
    validatePermissions(context: ExecutionContext): boolean;
  }
  
  interface ActionResult {
    success: boolean;
    data?: any;
    error?: {
      code: string;
      message: string;
      details?: any;
    };
  }
  
  interface ExecutionContext {
    userId: string;
    permissions: string[];
    environment: 'development' | 'testing' | 'production';
    requestId: string;
  }
  
  // ======= Context Injection Layer =======
  
  class ContextInjector {
    private dataSources: Map<string, DataSource> = new Map();
    private contextPromptTemplates: Map<string, string> = new Map();
  
    constructor(config: {
      promptTemplates?: Record<string, string>;
    } = {}) {
      if (config.promptTemplates) {
        Object.entries(config.promptTemplates).forEach(([key, value]) => {
          this.contextPromptTemplates.set(key, value);
        });
      }
    }
  
    registerDataSource(dataSource: DataSource): void {
      this.dataSources.set(dataSource.id, dataSource);
    }
  
    unregisterDataSource(dataSourceId: string): void {
      this.dataSources.delete(dataSourceId);
    }
  
    setPromptTemplate(key: string, template: string): void {
      this.contextPromptTemplates.set(key, template);
    }
  
    async buildContext(dataSourceIds: string[], userQuery: string): Promise<string> {
      let context = '';
      
      for (const dsId of dataSourceIds) {
        const dataSource = this.dataSources.get(dsId);
        if (!dataSource) {
          throw new Error(`Data source ${dsId} not found`);
        }
  
        const connection = await dataSource.connect();
        try {
          const schema = await dataSource.getSchema();
          const metadata = await dataSource.getMetadata();
          
          // Get appropriate template for this data source type
          const template = this.contextPromptTemplates.get(dataSource.type) || 
            this.contextPromptTemplates.get('default') || 
            'Data source: {{id}}\nType: {{type}}\nSchema: {{schema}}\nMetadata: {{metadata}}';
          
          // Replace template variables
          const contextPart = template
            .replace('{{id}}', dataSource.id)
            .replace('{{type}}', dataSource.type)
            .replace('{{schema}}', JSON.stringify(schema, null, 2))
            .replace('{{metadata}}', JSON.stringify(metadata, null, 2));
          
          context += contextPart + '\n\n';
        } finally {
          await connection.close();
        }
      }
      
      // Add information about the user query
      context += `User query: ${userQuery}\n\n`;
      context += 'Your task is to understand the data sources and the user query, then generate a response that fulfills the user request.';
      
      return context;
    }
  }
  
  // ======= LLM Integration Layer =======
  
  class LLMManager {
    private providers: Map<string, LLMProvider> = new Map();
    private defaultProviderId: string | null = null;
  
    registerProvider(provider: LLMProvider): void {
      this.providers.set(provider.id, provider);
      
      // Set as default if first provider
      if (this.providers.size === 1) {
        this.defaultProviderId = provider.id;
      }
    }
  
    unregisterProvider(providerId: string): void {
      this.providers.delete(providerId);
      
      // Update default provider if needed
      if (this.defaultProviderId === providerId) {
        this.defaultProviderId = this.providers.size > 0 ? 
          Array.from(this.providers.keys())[0] : null;
      }
    }
  
    setDefaultProvider(providerId: string): void {
      if (!this.providers.has(providerId)) {
        throw new Error(`Provider ${providerId} not found`);
      }
      this.defaultProviderId = providerId;
    }
  
    async callLLM(
      request: LLMRequest, 
      providerId?: string
    ): Promise<LLMResponse> {
      const provider = this.getProvider(providerId);
      return await provider.call(request);
    }
  
    async streamLLM(
      request: LLMRequest,
      providerId?: string
    ): AsyncIterableIterator<LLMResponseChunk> {
      const provider = this.getProvider(providerId);
      return provider.stream(request);
    }
  
    private getProvider(providerId?: string): LLMProvider {
      const id = providerId || this.defaultProviderId;
      if (!id) {
        throw new Error('No LLM provider registered');
      }
      
      const provider = this.providers.get(id);
      if (!provider) {
        throw new Error(`Provider ${id} not found`);
      }
      
      return provider;
    }
  }
  
  // ======= Output Validation Layer =======
  
  class OutputValidator {
    private schemas: Map<string, OutputSchema> = new Map();
  
    registerSchema(id: string, schema: OutputSchema): void {
      this.schemas.set(id, schema);
    }
  
    unregisterSchema(id: string): void {
      this.schemas.delete(id);
    }
  
    async validateOutput(
      output: string, 
      schemaId: string
    ): Promise<{ isValid: boolean; errors: string[]; json?: Record<string, any> }> {
      const schema = this.schemas.get(schemaId);
      if (!schema) {
        throw new Error(`Schema ${schemaId} not found`);
      }
      
      let json: Record<string, any>;
      const errors: string[] = [];
      
      // Parse JSON
      try {
        json = JSON.parse(output);
      } catch (e) {
        return { 
          isValid: false, 
          errors: ['Invalid JSON format: ' + (e as Error).message],
          json: undefined
        };
      }
      
      // Validate against schema
      const validationResult = this.validateAgainstSchema(json, schema);
      
      return {
        isValid: validationResult.errors.length === 0,
        errors: validationResult.errors,
        json: validationResult.errors.length === 0 ? json : undefined
      };
    }
    
    private validateAgainstSchema(
      json: any, 
      schema: OutputSchema | OutputSchemaProperty,
      path: string = ''
    ): { errors: string[] } {
      const errors: string[] = [];
      
      // Check required fields
      if ('required' in schema && Array.isArray(schema.required)) {
        for (const field of schema.required) {
          if (!(field in json)) {
            errors.push(`Missing required field: ${path ? path + '.' + field : field}`);
          }
        }
      }
      
      // Check property types and values
      if ('properties' in schema && schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          const propPath = path ? path + '.' + propName : propName;
          
          // Skip if property doesn't exist (already handled by required check)
          if (!(propName in json)) continue;
          
          // Validate property type
          const propValue = json[propName];
          if (propSchema.type === 'object' && typeof propValue === 'object' && propValue !== null && !Array.isArray(propValue)) {
            const nestedResult = this.validateAgainstSchema(
              propValue, 
              propSchema,
              propPath
            );
            errors.push(...nestedResult.errors);
          } 
          else if (propSchema.type === 'array' && Array.isArray(propValue)) {
            if (propSchema.items) {
              propValue.forEach((item, idx) => {
                const itemResult = this.validateAgainstSchema(
                  item,
                  propSchema.items as OutputSchemaProperty,
                  `${propPath}[${idx}]`
                );
                errors.push(...itemResult.errors);
              });
            }
          }
          else if (!this.validateType(propValue, propSchema.type)) {
            errors.push(`Invalid type for ${propPath}: expected ${propSchema.type}, got ${typeof propValue}`);
          }
          
          // Check enum values
          if (propSchema.enum && !propSchema.enum.includes(propValue)) {
            errors.push(`Invalid value for ${propPath}: must be one of [${propSchema.enum.join(', ')}]`);
          }
        }
      }
      
      return { errors };
    }
    
    private validateType(value: any, type: string): boolean {
      switch (type) {
        case 'string': return typeof value === 'string';
        case 'number': return typeof value === 'number';
        case 'boolean': return typeof value === 'boolean';
        case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
        case 'array': return Array.isArray(value);
        case 'null': return value === null;
        default: return true; // Unknown types are valid
      }
    }
  }
  
  // ======= Action Execution Engine =======
  
  class ActionExecutionEngine {
    private actions: Map<string, ActionDefinition> = new Map();
    private contextProvider: (() => ExecutionContext) | null = null;
  
    registerAction(action: ActionDefinition): void {
      this.actions.set(action.id, action);
    }
  
    unregisterAction(actionId: string): void {
      this.actions.delete(actionId);
    }
  
    setContextProvider(provider: () => ExecutionContext): void {
      this.contextProvider = provider;
    }
  
    async executeAction(
      actionId: string, 
      params: Record<string, any>,
      context?: ExecutionContext
    ): Promise<ActionResult> {
      const action = this.actions.get(actionId);
      if (!action) {
        return {
          success: false,
          error: {
            code: 'ACTION_NOT_FOUND',
            message: `Action ${actionId} not found`
          }
        };
      }
      
      // Get execution context
      const executionContext = context || (this.contextProvider ? this.contextProvider() : undefined);
      if (!executionContext) {
        return {
          success: false,
          error: {
            code: 'CONTEXT_MISSING',
            message: 'Execution context is required but was not provided'
          }
        };
      }
      
      // Validate permissions
      if (!action.validatePermissions(executionContext)) {
        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Insufficient permissions to execute this action'
          }
        };
      }
      
      // Validate input against schema
      const validator = new OutputValidator();
      validator.registerSchema(action.id, action.inputSchema);
      const validationResult = await validator.validateOutput(
        JSON.stringify(params),
        action.id
      );
      
      if (!validationResult.isValid) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Invalid parameters for action execution',
            details: validationResult.errors
          }
        };
      }
      
      // Execute action
      try {
        return await action.execute(params);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: (error as Error).message || 'Unknown error during action execution',
            details: error
          }
        };
      }
    }
  }
  
  // ======= RNCP Core =======
  
  class RNCPCore {
    contextInjector: ContextInjector;
    llmManager: LLMManager;
    outputValidator: OutputValidator;
    actionEngine: ActionExecutionEngine;
    
    constructor() {
      this.contextInjector = new ContextInjector();
      this.llmManager = new LLMManager();
      this.outputValidator = new OutputValidator();
      this.actionEngine = new ActionExecutionEngine();
    }
    
    async processUserRequest(
      userQuery: string,
      options: {
        dataSources?: string[];
        schemaId: string;
        actionId?: string;
        llmProviderId?: string;
        executionContext?: ExecutionContext;
      }
    ): Promise<{
      llmResponse: LLMResponse;
      validationResult: { isValid: boolean; errors: string[]; json?: Record<string, any> };
      actionResult?: ActionResult;
    }> {
      // 1. Build context from data sources
      const context = await this.contextInjector.buildContext(
        options.dataSources || [],
        userQuery
      );
      
      // 2. Call LLM with context
      const llmResponse = await this.llmManager.callLLM({
        prompt: userQuery,
        systemPrompt: context,
        format: 'json'
      }, options.llmProviderId);
      
      // 3. Validate LLM output
      const validationResult = await this.outputValidator.validateOutput(
        llmResponse.content,
        options.schemaId
      );
      
      // 4. Execute action if requested and output is valid
      let actionResult: ActionResult | undefined = undefined;
      if (options.actionId && validationResult.isValid && validationResult.json) {
        actionResult = await this.actionEngine.executeAction(
          options.actionId,
          validationResult.json,
          options.executionContext
        );
      }
      
      return {
        llmResponse,
        validationResult,
        actionResult
      };
    }
  }
  
  // Export the RNCP framework
  export {
    RNCPCore,
    ContextInjector,
    LLMManager,
    OutputValidator,
    ActionExecutionEngine,
    // Types
    DataSource,
    DataConnection,
    Schema,
    SchemaField,
    SchemaRelationship,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMResponseChunk,
    LLMCapabilityRequirement,
    OutputSchema,
    OutputSchemaProperty,
    ActionDefinition,
    ActionResult,
    ExecutionContext
  };