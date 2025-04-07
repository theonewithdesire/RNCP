# RNCP Developer Guide

## Require No Context Protocol

RNCP (Require No Context Protocol) is an open architecture for creating agent-based systems powered by Large Language Models (LLMs) with a focus on control, flexibility, and action-oriented outcomes.

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Getting Started](#getting-started)
4. [Core Components](#core-components)
5. [Example Implementations](#example-implementations)
6. [Best Practices](#best-practices)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)

## Introduction

RNCP is designed to address several limitations of existing LLM agent frameworks:

- **Explicit Control Flow**: Clear separation between data sources, LLM interaction, and action execution
- **Validation-First Approach**: Built-in schema validation ensures output reliability
- **Model Agnostic**: Works with any LLM that can follow instructions and generate structured outputs
- **Action-Oriented**: Focused on enabling concrete actions based on LLM outputs
- **Developer-Centric**: Designed for easy integration into existing systems and workflows

## Architecture Overview

RNCP consists of four primary components working in sequence:

1. **Context Injection Layer**

   - Connects to data sources
   - Provides context about data structure and operations
   - Manages authentication and security for data access

2. **LLM Core**

   - Processes user queries with contextual information
   - Generates structured responses (primarily JSON)
   - Model-agnostic interface for plug-and-play capabilities

3. **Output Validation & Transformation Layer**

   - Validates LLM outputs against schema definitions
   - Implements retry logic for malformed outputs
   - Ensures security and prevents potential exploits

4. **Action Execution Engine**
   - Interprets validated JSON instructions
   - Executes actions in target environments
   - Implements safety checks before execution

## Getting Started

### Installation

```bash
npm install rncp-core
```

### Basic Implementation

```typescript
import { RNCPCore } from "rncp-core";
import { PostgresDataSource } from "rncp-datasources";
import { OpenAIProvider } from "rncp-llm-providers";
import { FileSystemAction } from "rncp-actions";

async function main() {
  // Initialize RNCP
  const rncp = new RNCPCore();

  // Register data source
  const dbSource = new PostgresDataSource({
    id: "customer-db",
    connectionString: process.env.DB_CONNECTION_STRING,
  });
  rncp.contextInjector.registerDataSource(dbSource);

  // Register LLM provider
  const llmProvider = new OpenAIProvider({
    id: "openai",
    apiKey: process.env.OPENAI_API_KEY,
  });
  rncp.llmManager.registerProvider(llmProvider);

  // Register output schema
  rncp.outputValidator.registerSchema("file-operation", {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["read", "write", "append"],
      },
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["operation", "path"],
  });

  // Register action
  rncp.actionEngine.registerAction(new FileSystemAction());

  // Process a user request
  const result = await rncp.processUserRequest(
    "Please create a file with today's sales report from the database",
    {
      dataSources: ["customer-db"],
      schemaId: "file-operation",
      actionId: "filesystem",
      executionContext: {
        userId: "user123",
        permissions: ["read", "write"],
        environment: "development",
        requestId: "req-123",
      },
    }
  );

  console.log("Result:", result);
}

main().catch(console.error);
```

## Core Components

### Context Injector

The Context Injector connects to data sources and builds contextual prompts for the LLM:

```typescript
// Register a data source
rncp.contextInjector.registerDataSource(
  new MongoDBDataSource({
    id: "product-catalog",
    connectionString: "mongodb://localhost:27017/products",
  })
);

// Set custom prompt templates
rncp.contextInjector.setPromptTemplate(
  "mongodb",
  `
Database: {{id}}
Collection Schema: {{schema}}
Usage Instructions: This MongoDB database contains product information.
To query products, use the proper collection name and field references.
`
);
```

### LLM Manager

The LLM Manager handles interactions with different LLM providers:

```typescript
// Register multiple providers
rncp.llmManager.registerProvider(
  new OpenAIProvider({
    id: "gpt-4",
    model: "gpt-4",
    apiKey: process.env.OPENAI_API_KEY,
  })
);

rncp.llmManager.registerProvider(
  new DeepSeekProvider({
    id: "deepseek-coder",
    apiKey: process.env.DEEPSEEK_API_KEY,
  })
);

// Set default provider
rncp.llmManager.setDefaultProvider("gpt-4");

// Call LLM with specific provider
const response = await rncp.llmManager.callLLM(
  {
    prompt: "Generate SQL query to find high-value customers",
    temperature: 0.2,
    format: "json",
  },
  "deepseek-coder"
);
```

### Output Validator

The Output Validator ensures LLM outputs conform to expected schemas:

```typescript
// Register a schema
rncp.outputValidator.registerSchema("sql-query", {
  type: "object",
  properties: {
    query: { type: "string" },
    description: { type: "string" },
    parameters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          value: { type: "string" },
        },
        required: ["name", "type"],
      },
    },
  },
  required: ["query"],
});

// Validate output
const validationResult = await rncp.outputValidator.validateOutput(
  jsonString,
  "sql-query"
);

if (!validationResult.isValid) {
  console.error("Validation errors:", validationResult.errors);
} else {
  console.log("Valid JSON:", validationResult.json);
}
```

### Action Execution Engine

The Action Execution Engine runs actions based on validated LLM outputs:

```typescript
// Define a custom action
class EmailAction implements ActionDefinition {
  id = "email";
  name = "Send Email";
  description = "Sends an email to specified recipients";

  inputSchema: OutputSchema = {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
      cc: { type: "string" },
    },
    required: ["to", "subject", "body"],
  };

  async execute(params: Record<string, any>): Promise<ActionResult> {
    try {
      // Email sending logic here
      return {
        success: true,
        data: { messageId: "msg-123" },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "EMAIL_SEND_FAILED",
          message: (error as Error).message,
        },
      };
    }
  }

  validatePermissions(context: ExecutionContext): boolean {
    return context.permissions.includes("send_email");
  }
}

// Register the action
rncp.actionEngine.registerAction(new EmailAction());

// Execute the action
const result = await rncp.actionEngine.executeAction(
  "email",
  {
    to: "customer@example.com",
    subject: "Order Confirmation",
    body: "Thank you for your order #12345",
  },
  {
    userId: "agent001",
    permissions: ["send_email"],
    environment: "production",
    requestId: "req-456",
  }
);
```

## Example Implementations

### Building a Customer Support Agent

```typescript
// Initialize RNCP core
const rncp = new RNCPCore();

// Register data sources
rncp.contextInjector.registerDataSource(
  new TicketSystemDataSource({
    id: "zendesk",
    apiKey: process.env.ZENDESK_API_KEY,
  })
);

rncp.contextInjector.registerDataSource(
  new KnowledgeBaseDataSource({
    id: "knowledge-base",
    path: "./knowledge",
  })
);

// Register LLM provider
rncp.llmManager.registerProvider(
  new OpenAIProvider({
    id: "gpt-4",
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// Register output schema
rncp.outputValidator.registerSchema("support-response", {
  type: "object",
  properties: {
    responseType: {
      type: "string",
      enum: ["direct-answer", "escalate", "create-ticket"],
    },
    message: { type: "string" },
    relevantArticles: {
      type: "array",
      items: { type: "string" },
    },
    ticketDetails: {
      type: "object",
      properties: {
        priority: { type: "string" },
        category: { type: "string" },
        assignTo: { type: "string" },
      },
    },
  },
  required: ["responseType", "message"],
});

// Register actions
rncp.actionEngine.registerAction(new RespondToCustomerAction());
rncp.actionEngine.registerAction(new CreateTicketAction());
rncp.actionEngine.registerAction(new EscalateToAgentAction());

// Process support request
async function handleSupportRequest(query: string, customerId: string) {
  return await rncp.processUserRequest(query, {
    dataSources: ["zendesk", "knowledge-base"],
    schemaId: "support-response",
    actionId: "respond-to-customer",
    executionContext: {
      userId: "system",
      permissions: ["respond", "create-ticket", "escalate"],
      environment: "production",
      requestId: `req-${Date.now()}`,
    },
  });
}
```

## Best Practices

### Security First

- Always validate LLM outputs before execution
- Use the permission system to restrict action capabilities
- Never expose raw data source credentials to the LLM

### Performance Optimization

- Keep context concise and relevant
- Cache frequently used data source schemas
- Use streaming responses for long-running operations

### Error Handling

- Implement retry mechanisms for LLM calls
- Provide clear error messages to end users
- Log detailed error information for debugging

### Schema Design

- Start with minimal schemas and expand as needed
- Use enums to restrict possible values for critical fields
- Document schema properties with clear descriptions

## Security Considerations

### Authentication & Authorization

RNCP separates authentication and authorization:

1. **Authentication**: Identify who is making the request
2. **Authorization**: Verify permissions through the ExecutionContext

Example:

```typescript
// Set context provider
rncp.actionEngine.setContextProvider(() => {
  const user = getCurrentAuthenticatedUser();
  return {
    userId: user.id,
    permissions: user.roles.flatMap((role) => role.permissions),
    environment: process.env.NODE_ENV as "development" | "production",
    requestId: generateRequestId(),
  };
});
```

### Input Validation

Always validate user inputs before processing:

```typescript
function sanitizeUserQuery(query: string): string {
  // Remove potential prompt injection attempts
  return query.replace(/system:|assistant:/gi, '[filtered]');
}

const result = await rncp.processUserRequest(
  sanitizeUserQuery(userInput),
  {...}
);
```

### Data Exposure

Be careful what data is exposed to the LLM:

```typescript
// Filter sensitive data from context
class FilteredDataSource implements DataSource {
  // ...

  async getSchema(): Promise<Schema> {
    const schema = await this.originalSource.getSchema();
    return {
      ...schema,
      fields: schema.fields.filter((field) => !field.name.includes("password")),
    };
  }
}
```

## Troubleshooting

### Common Issues

1. **Invalid LLM Outputs**

   - Check your prompt templates for clarity
   - Use lower temperature settings for more predictable outputs
   - Ensure schema examples are included in system prompts

2. **Data Connection Failures**

   - Verify connection strings and credentials
   - Implement connection pooling for database sources
   - Add appropriate error handling for network issues

3. **Permission Errors**

   - Check that the ExecutionContext contains required permissions
   - Verify that action permissions are properly defined
   - Add detailed logging for authorization failures

4. **Performance Problems**
   - Reduce context size by filtering unnecessary data
   - Implement caching for frequently accessed schema information
   - Use streaming for long-running operations
   - Consider batching multiple data source queries

### Debugging Tips

1. **Log LLM Interactions**

```typescript
// Enable debug logging
rncp.llmManager.setDebugMode(true);

// Log both input and output
rncp.llmManager.on("beforeCall", (request) => {
  logger.debug("LLM Request:", request);
});

rncp.llmManager.on("afterCall", (response) => {
  logger.debug("LLM Response:", response);
});
```

2. **Test Components Individually**

```typescript
// Test context building
const context = await rncp.contextInjector.buildContext(
  ["data-source-1"],
  "test query"
);
console.log("Generated Context:", context);

// Test output validation
const validationResult = await rncp.outputValidator.validateOutput(
  testJson,
  "test-schema"
);
console.log("Validation Result:", validationResult);
```

3. **Mock Components for Testing**

```typescript
// Mock LLM provider for testing
class MockLLMProvider implements LLMProvider {
  id = "mock-llm";

  async call(params: LLMRequest): Promise<LLMResponse> {
    return {
      content: JSON.stringify({ result: "mock response" }),
      format: "json",
      parsedJson: { result: "mock response" },
      metadata: {
        tokenUsage: { input: 10, output: 5, total: 15 },
        modelId: "mock-model",
        timestamp: Date.now(),
      },
    };
  }

  // Other required methods...
}

// Use mock for testing
rncp.llmManager.registerProvider(new MockLLMProvider());
```
