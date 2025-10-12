"""
Complete OpenAPI schema definition for GIA Platform API
Separated from main.py to keep it clean and maintainable
"""

import os

def get_openapi_schema():
    """Return the complete OpenAPI schema for the GIA Platform API"""
    # Get server URL from environment
    server_url = os.getenv('CLIENT_URL', 'http://localhost:4000')
    
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "GIA Platform API",
            "version": "1.0.0", 
            "description": "Comprehensive AI-powered platform API with authentication, role management, agent orchestration, workflow automation, and analytics capabilities"
        },
        "servers": [
            {"url": server_url, "description": "API server"}
        ],
        "tags": [
            {"name": "Authentication", "description": "User authentication and OAuth"},
            {"name": "Users", "description": "User management"},
            {"name": "Profile", "description": "User profile management"},
            {"name": "Roles", "description": "Role-based access control"},
            {"name": "Tenants", "description": "Multi-tenant organization management"},
            {"name": "Agents", "description": "AI agent configuration and management"},
            {"name": "Agent Runtime", "description": "Real-time agent execution and conversations"},
            {"name": "Models", "description": "AI model configuration"},
            {"name": "Tools", "description": "Tool configuration for agents"},
            {"name": "Knowledge", "description": "Knowledge base and document management"},
            {"name": "Workflows", "description": "Business process automation"},
            {"name": "Analytics", "description": "Platform analytics and reporting"},
            {"name": "Uploads", "description": "File upload and management"},
            {"name": "Menu", "description": "Dynamic menu management"},
            {"name": "Payments", "description": "Payment processing"}
        ],
        "paths": {
            # Core endpoints
            "/": {
                "get": {
                    "tags": ["Core"],
                    "summary": "API root",
                    "description": "Check if API is running",
                    "responses": {"200": {"description": "API status", "content": {"application/json": {"schema": {"type": "object", "properties": {"message": {"type": "string"}}}}}}}
                }
            },
            "/health": {
                "get": {
                    "tags": ["Core"],
                    "summary": "Health check",
                    "description": "Get service health status",
                    "responses": {"200": {"description": "Health status", "content": {"application/json": {"schema": {"type": "object", "properties": {"status": {"type": "string"}, "timestamp": {"type": "string"}}}}}}}
                }
            },
            
            # Authentication endpoints
            "/auth/login": {
                "post": {
                    "tags": ["Authentication"],
                    "summary": "User login",
                    "description": "Authenticate user with email and password",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string", "format": "email"}, "password": {"type": "string"}}, "required": ["email", "password"]}}}},
                    "responses": {"200": {"description": "Login successful", "content": {"application/json": {"schema": {"type": "object", "properties": {"token": {"type": "string"}, "user": {"type": "object"}}}}}}}
                }
            },
            "/auth/google": {
                "get": {
                    "tags": ["Authentication"],
                    "summary": "Google OAuth login",
                    "description": "Initiate Google OAuth flow",
                    "responses": {"302": {"description": "Redirect to Google OAuth"}}
                }
            },
            "/auth/google/callback": {
                "get": {
                    "tags": ["Authentication"],
                    "summary": "Google OAuth callback",
                    "description": "Handle Google OAuth callback",
                    "responses": {"302": {"description": "Redirect with authentication token"}}
                }
            },
            "/auth/microsoft": {
                "get": {
                    "tags": ["Authentication"],
                    "summary": "Microsoft OAuth login",
                    "description": "Initiate Microsoft OAuth flow",
                    "responses": {"302": {"description": "Redirect to Microsoft OAuth"}}
                }
            },
            "/auth/microsoft/callback": {
                "get": {
                    "tags": ["Authentication"],
                    "summary": "Microsoft OAuth callback",
                    "description": "Handle Microsoft OAuth callback",
                    "responses": {"302": {"description": "Redirect with authentication token"}}
                }
            },
            "/auth/logout": {
                "post": {
                    "tags": ["Authentication"],
                    "summary": "User logout",
                    "description": "Logout current user",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Logout successful"}}
                }
            },
            "/auth/me": {
                "get": {
                    "tags": ["Authentication"],
                    "summary": "Get current user",
                    "description": "Get current authenticated user information",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Current user information"}}
                }
            },
            
            # User management
            "/api/users": {
                "get": {
                    "tags": ["Users"],
                    "summary": "List users",
                    "description": "Get list of users in tenant",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of users"}}
                },
                "post": {
                    "tags": ["Users"],
                    "summary": "Create user",
                    "description": "Create new user account",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}, "firstName": {"type": "string"}, "lastName": {"type": "string"}, "password": {"type": "string"}}}}}},
                    "responses": {"201": {"description": "User created successfully"}}
                }
            },
            "/api/users/verify": {
                "post": {
                    "tags": ["Users"],
                    "summary": "Verify user email",
                    "description": "Verify user email with token",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"token": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Email verified successfully"}}
                }
            },
            "/api/users/login": {
                "post": {
                    "tags": ["Users"],
                    "summary": "User login (deprecated)",
                    "description": "Alternative login endpoint",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}, "password": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Login successful"}}
                }
            },
            
            # Profile management
            "/api/profile": {
                "get": {
                    "tags": ["Profile"],
                    "summary": "Get user profile",
                    "description": "Get current user profile information",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "User profile"}}
                },
                "put": {
                    "tags": ["Profile"],
                    "summary": "Update profile",
                    "description": "Update user profile information",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"firstName": {"type": "string"}, "lastName": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Profile updated successfully"}}
                }
            },
            "/api/profile/completeness": {
                "get": {
                    "tags": ["Profile"],
                    "summary": "Profile completeness",
                    "description": "Check profile completion status",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Profile completeness information"}}
                }
            },
            
            # Agents
            "/api/agents": {
                "get": {
                    "tags": ["Agents"],
                    "summary": "List agents",
                    "description": "Get list of available agents",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "category", "in": "query", "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "List of agents"}}
                },
                "post": {
                    "tags": ["Agents"],
                    "summary": "Create agent",
                    "description": "Create new AI agent",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "config": {"type": "object"}}}}}},
                    "responses": {"201": {"description": "Agent created successfully"}}
                }
            },
            "/api/agents/{name}": {
                "get": {
                    "tags": ["Agents"],
                    "summary": "Get agent",
                    "description": "Get specific agent by name",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Agent details"}}
                },
                "delete": {
                    "tags": ["Agents"],
                    "summary": "Delete agent",
                    "description": "Delete agent by name",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Agent deleted successfully"}}
                }
            },
            "/api/agents/id/{agent_id}": {
                "delete": {
                    "tags": ["Agents"],
                    "summary": "Delete agent by ID",
                    "description": "Delete agent by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "agent_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Agent deleted successfully"}}
                }
            },
            
            # Agent Runtime
            "/api/agent-runtime/run": {
                "post": {
                    "tags": ["Agent Runtime"],
                    "summary": "Execute agent",
                    "description": "Execute agent with streaming response",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"agent": {"type": "string"}, "prompt": {"type": "string"}, "conv_id": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Streaming agent response", "content": {"text/event-stream": {"schema": {"type": "string"}}}}}
                }
            },
            "/api/agent-runtime/conversations": {
                "get": {
                    "tags": ["Agent Runtime"],
                    "summary": "List conversations",
                    "description": "Get list of conversations",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 5}},
                        {"name": "agent_name", "in": "query", "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "List of conversations"}}
                },
                "post": {
                    "tags": ["Agent Runtime"],
                    "summary": "Create conversation",
                    "description": "Create new conversation",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"agent_name": {"type": "string"}, "title": {"type": "string"}}}}}},
                    "responses": {"201": {"description": "Conversation created"}}
                }
            },
            "/api/agent-runtime/conversations/{conversation_id}": {
                "get": {
                    "tags": ["Agent Runtime"],
                    "summary": "Get conversation",
                    "description": "Get specific conversation",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "conversation_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Conversation details"}}
                },
                "delete": {
                    "tags": ["Agent Runtime"],
                    "summary": "Delete conversation",
                    "description": "Delete conversation",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "conversation_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Conversation deleted"}}
                }
            },
            "/api/agent-runtime/debug/conversations": {
                "get": {
                    "tags": ["Agent Runtime"],
                    "summary": "Debug conversations",
                    "description": "Get conversations for debugging",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Debug conversation data"}}
                }
            },
            
            # Models
            "/api/models/providers": {
                "get": {
                    "tags": ["Models"],
                    "summary": "List model providers",
                    "description": "Get available model providers",
                    "responses": {"200": {"description": "List of model providers"}}
                }
            },
            "/api/models/configs": {
                "get": {
                    "tags": ["Models"],
                    "summary": "List model configurations",
                    "description": "Get model configurations with pagination",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 8}},
                        {"name": "category", "in": "query", "schema": {"type": "string"}},
                        {"name": "search", "in": "query", "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "Paginated model configurations"}}
                },
                "post": {
                    "tags": ["Models"],
                    "summary": "Create model configuration",
                    "description": "Create new model configuration",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "provider": {"type": "string"}, "model": {"type": "string"}, "parameters": {"type": "object"}}}}}},
                    "responses": {"201": {"description": "Model configuration created"}}
                }
            },
            "/api/models/configs/{config_id}": {
                "get": {
                    "tags": ["Models"],
                    "summary": "Get model configuration",
                    "description": "Get specific model configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Model configuration details"}}
                },
                "put": {
                    "tags": ["Models"],
                    "summary": "Update model configuration",
                    "description": "Update existing model configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Model configuration updated"}}
                },
                "delete": {
                    "tags": ["Models"],
                    "summary": "Delete model configuration",
                    "description": "Delete model configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Model configuration deleted"}}
                }
            },
            "/api/models/components": {
                "get": {
                    "tags": ["Models"],
                    "summary": "List model components",
                    "description": "Get available model components",
                    "responses": {"200": {"description": "Model components"}}
                }
            },
            "/api/models/introspect": {
                "post": {
                    "tags": ["Models"],
                    "summary": "Introspect model",
                    "description": "Introspect model capabilities",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Model introspection results"}}
                }
            },
            
            # Tools
            "/api/tools/configs": {
                "get": {
                    "tags": ["Tools"],
                    "summary": "List tool configurations",
                    "description": "Get tool configurations",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of tool configurations"}}
                },
                "post": {
                    "tags": ["Tools"],
                    "summary": "Create tool configuration",
                    "description": "Create new tool configuration",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"201": {"description": "Tool configuration created"}}
                }
            },
            "/api/tools/configs/{config_name}": {
                "get": {
                    "tags": ["Tools"],
                    "summary": "Get tool configuration",
                    "description": "Get specific tool configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_name", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Tool configuration details"}}
                }
            },
            "/api/tools/configs/{config_id}": {
                "put": {
                    "tags": ["Tools"],
                    "summary": "Update tool configuration",
                    "description": "Update tool configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Tool configuration updated"}}
                },
                "delete": {
                    "tags": ["Tools"],
                    "summary": "Delete tool configuration",
                    "description": "Delete tool configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Tool configuration deleted"}}
                }
            },
            "/api/tools/categories": {
                "get": {
                    "tags": ["Tools"],
                    "summary": "List tool categories",
                    "description": "Get available tool categories",
                    "responses": {"200": {"description": "Tool categories"}}
                }
            },
            "/api/tools/components": {
                "get": {
                    "tags": ["Tools"],
                    "summary": "List tool components",  
                    "description": "Get available tool components",
                    "responses": {"200": {"description": "Tool components"}}
                }
            },
            "/api/tools/introspect": {
                "post": {
                    "tags": ["Tools"],
                    "summary": "Introspect tool",
                    "description": "Introspect tool capabilities",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Tool introspection results"}}
                }
            },
            
            # Knowledge
            "/api/knowledge/defaults": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "Get knowledge defaults",
                    "description": "Get default knowledge configurations",
                    "responses": {"200": {"description": "Default knowledge configurations"}}
                }
            },
            "/api/knowledge/categories": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "List knowledge categories",
                    "description": "Get knowledge categories",
                    "responses": {"200": {"description": "Knowledge categories"}}
                }
            },
            "/api/knowledge/configs": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "List knowledge configurations",
                    "description": "Get knowledge configurations",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Knowledge configurations"}}
                }
            },
            "/api/knowledge/collections": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "List knowledge collections",
                    "description": "Get knowledge collections",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Knowledge collections"}}
                }
            },
            "/api/knowledge/collection/{collection}": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "Get collection",
                    "description": "Get specific knowledge collection",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "collection", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Collection details"}}
                },
                "delete": {
                    "tags": ["Knowledge"],
                    "summary": "Delete collection",
                    "description": "Delete knowledge collection",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "collection", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Collection deleted"}}
                }
            },
            "/api/knowledge/collection/save": {
                "post": {
                    "tags": ["Knowledge"],
                    "summary": "Save collection",
                    "description": "Save knowledge collection",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Collection saved"}}
                }
            },
            "/api/knowledge/collection/{collection}/file/{filename}": {
                "delete": {
                    "tags": ["Knowledge"],
                    "summary": "Delete file from collection",
                    "description": "Delete file from knowledge collection",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "collection", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "File deleted from collection"}}
                }
            },
            "/api/knowledge/upload": {
                "post": {
                    "tags": ["Knowledge"],
                    "summary": "Upload to knowledge base",
                    "description": "Upload files to knowledge base",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"files": {"type": "array", "items": {"type": "string", "format": "binary"}}}}}}},
                    "responses": {"200": {"description": "Files uploaded successfully"}}
                }
            },
            "/api/knowledge/diag": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "Knowledge diagnostics",
                    "description": "Get knowledge system diagnostics",
                    "responses": {"200": {"description": "Knowledge diagnostics"}}
                }
            },
            "/api/knowledge/components": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "List knowledge components",
                    "description": "Get available knowledge components",
                    "responses": {"200": {"description": "Knowledge components"}}
                }
            },
            "/api/knowledge/components/chunking": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "List chunking components",
                    "description": "Get chunking components",
                    "responses": {"200": {"description": "Chunking components"}}
                }
            },
            "/api/knowledge/components/chunking/{component_name}": {
                "get": {
                    "tags": ["Knowledge"],
                    "summary": "Get chunking component",
                    "description": "Get specific chunking component",
                    "parameters": [{"name": "component_name", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Chunking component details"}}
                }
            },
            "/api/knowledge/introspect": {
                "post": {
                    "tags": ["Knowledge"],
                    "summary": "Introspect knowledge",
                    "description": "Introspect knowledge capabilities",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Knowledge introspection results"}}
                }
            },
            
            # Analytics
            "/api/analytics/overview": {
                "get": {
                    "tags": ["Analytics"],
                    "summary": "Analytics overview",
                    "description": "Get platform analytics overview",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Analytics overview"}}
                }
            },
            "/api/analytics/daily-stats": {
                "get": {
                    "tags": ["Analytics"],
                    "summary": "Daily statistics",
                    "description": "Get daily platform statistics",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Daily statistics"}}
                }
            },
            "/api/analytics/agent-performance": {
                "get": {
                    "tags": ["Analytics"],
                    "summary": "Agent performance",
                    "description": "Get agent performance metrics",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "limit", "in": "query", "schema": {"type": "integer", "default": 10}}],
                    "responses": {"200": {"description": "Agent performance metrics"}}
                }
            },
            "/api/analytics/recent-conversations": {
                "get": {
                    "tags": ["Analytics"],
                    "summary": "Recent conversations",
                    "description": "Get recent conversation analytics",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "limit", "in": "query", "schema": {"type": "integer", "default": 10}}],
                    "responses": {"200": {"description": "Recent conversation data"}}
                }
            },
            
            # Roles
            "/roles": {
                "get": {
                    "tags": ["Roles"],
                    "summary": "List all roles",
                    "description": "Get all available roles",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of roles"}}
                },
                "post": {
                    "tags": ["Roles"],
                    "summary": "Create role",
                    "description": "Create new role",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "permissions": {"type": "array", "items": {"type": "string"}}}}}}},
                    "responses": {"201": {"description": "Role created successfully"}}
                }
            },
            "/roles/{role_id}": {
                "put": {
                    "tags": ["Roles"],
                    "summary": "Update role",
                    "description": "Update existing role",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "role_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Role updated successfully"}}
                },
                "delete": {
                    "tags": ["Roles"],
                    "summary": "Delete role",
                    "description": "Delete role",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "role_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Role deleted successfully"}}
                }
            },
            "/roles/my-roles": {
                "get": {
                    "tags": ["Roles"],
                    "summary": "Get my roles",
                    "description": "Get current user's roles",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "User's roles"}}
                }
            },
            "/roles/assign": {
                "post": {
                    "tags": ["Roles"],
                    "summary": "Assign role",
                    "description": "Assign role to user",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"userId": {"type": "string"}, "roleId": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Role assigned successfully"}}
                },
                "delete": {
                    "tags": ["Roles"],
                    "summary": "Unassign role",
                    "description": "Remove role from user",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"userId": {"type": "string"}, "roleId": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Role unassigned successfully"}}
                }
            },
            "/users/{user_id}/roles": {
                "get": {
                    "tags": ["Roles"],
                    "summary": "Get user roles",
                    "description": "Get roles for specific user",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "User's roles"}}
                }
            },
            
            # Additional endpoints for completeness...
            "/api/payments/create-checkout-session": {
                "post": {
                    "tags": ["Payments"],
                    "summary": "Create checkout session",
                    "description": "Create Stripe checkout session",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"price_id": {"type": "string"}, "success_url": {"type": "string"}, "cancel_url": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Checkout session created"}}
                }
            },
            "/api/payments/verify": {
                "post": {
                    "tags": ["Payments"],
                    "summary": "Verify payment",
                    "description": "Verify payment completion",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"session_id": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Payment verification result"}}
                }
            },
            
            # File uploads
            "/upload": {
                "post": {
                    "tags": ["Uploads"],
                    "summary": "Upload files",
                    "description": "Upload files to the platform",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"files": {"type": "array", "items": {"type": "string", "format": "binary"}}}}}}},
                    "responses": {"200": {"description": "Files uploaded successfully"}}
                }
            },
            "/files": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "List uploaded files",
                    "description": "Get list of uploaded files",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of uploaded files"}}
                }
            },
            "/files/{filename}": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "Download file",
                    "description": "Download specific file",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "File content"}}
                }
            }
        },
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                    "description": "JWT token for authentication. Include as: Authorization: Bearer <token>"
                }
            },
            "schemas": {
                "Error": {
                    "type": "object",
                    "properties": {
                        "detail": {"type": "string"},
                        "status_code": {"type": "integer"}
                    }
                },
                "Success": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"},
                        "data": {"type": "object"}
                    }
                }
            }
        }
    }