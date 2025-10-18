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
            {"name": "Role Management", "description": "RBAC user and role assignment management"},
            {"name": "Tenants", "description": "Multi-tenant organization management"},
            {"name": "Projects", "description": "Project management and organization"},
            {"name": "Project Activities", "description": "Project activity tracking and management"},
            {"name": "Activity Notifications", "description": "Activity notification system"},
            {"name": "Agents", "description": "AI agent configuration and management"},
            {"name": "Agent Runtime", "description": "Real-time agent execution and conversations"},
            {"name": "Models", "description": "AI model configuration"},
            {"name": "Tools", "description": "Tool configuration for agents"},
            {"name": "Knowledge", "description": "Knowledge base and document management"},
            {"name": "Workflows", "description": "Business process automation"},
            {"name": "Workflow Config", "description": "Workflow configuration management"},
            {"name": "Analytics", "description": "Platform analytics and reporting"},
            {"name": "Dynamic Execution", "description": "Dynamic module and function execution"},
            {"name": "Scheduler", "description": "Job scheduling and management"},
            {"name": "Uploads", "description": "File upload and management"},
            {"name": "Payments", "description": "Payment processing"},
            {"name": "Core", "description": "Core API endpoints"}
        ],
        "paths": {
            # Scheduler endpoints (appended)
            "/jobs": {
                "get": {"tags": ["Scheduler"], "summary": "List jobs", "description": "List all scheduled jobs", "responses": {"200": {"description": "List of jobs"}}},
                "post": {"tags": ["Scheduler"], "summary": "Create job", "description": "Create a new job", "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}}, "responses": {"201": {"description": "Job created"}}}
            },
            "/jobs/{job_id}": {
                "get": {"tags": ["Scheduler"], "summary": "Get job", "description": "Get job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "Job details"}}},
                "put": {"tags": ["Scheduler"], "summary": "Update job", "description": "Update job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}}, "responses": {"200": {"description": "Job updated"}}},
                "delete": {"tags": ["Scheduler"], "summary": "Delete job", "description": "Delete job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "Job deleted"}}}
            },
            "/jobs/{job_id}/pause": {
                "post": {"tags": ["Scheduler"], "summary": "Pause job", "description": "Pause job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "Job paused"}}}
            },
            "/jobs/{job_id}/resume": {
                "post": {"tags": ["Scheduler"], "summary": "Resume job", "description": "Resume job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "Job resumed"}}}
            },
            "/jobs/{job_id}/run": {
                "post": {"tags": ["Scheduler"], "summary": "Run job", "description": "Run job by ID", "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}], "responses": {"200": {"description": "Job run triggered"}}}
            },
            "/status": {
                "get": {"tags": ["Scheduler"], "summary": "Scheduler status", "description": "Get scheduler status", "responses": {"200": {"description": "Scheduler status"}}}
            },
            # Workflow endpoints 
            "/api/workflow/workflows/{workflow_id}/start": {
                "post": {
                    "tags": ["Workflows"], 
                    "summary": "Start workflow", 
                    "description": "Start a new workflow instance using workflow configuration ID", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}], 
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"initial_data": {"type": "object"}}}}}}, 
                    "responses": {"200": {"description": "Workflow started successfully"}}
                }
            },
            "/api/workflow/workflows/by-name/{workflow_name}/start": {
                "post": {
                    "tags": ["Workflows"], 
                    "summary": "Start workflow by name", 
                    "description": "Start workflow instance using workflow name", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "workflow_name", "in": "path", "required": True, "schema": {"type": "string"}}], 
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"initial_data": {"type": "object"}}}}}}, 
                    "responses": {"200": {"description": "Workflow started successfully"}}
                }
            },
            "/api/workflow/workflows/health": {
                "get": {
                    "tags": ["Workflows"], 
                    "summary": "Workflow health check", 
                    "description": "Get workflow system health status", 
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Workflow health status"}}
                }
            },
            "/api/workflow/workflows/{workflow_id}/incomplete": {
                "get": {
                    "tags": ["Workflows"], 
                    "summary": "Get incomplete workflow", 
                    "description": "Get incomplete workflow tasks by workflow ID", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}], 
                    "responses": {"200": {"description": "Incomplete workflow details"}}
                }
            },
            "/api/workflow/workflows/{workflow_id}/instances": {
                "get": {
                    "tags": ["Workflows"], 
                    "summary": "List workflow instances", 
                    "description": "List all instances of a specific workflow", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 10}},
                        {"name": "status", "in": "query", "schema": {"type": "string"}}
                    ], 
                    "responses": {"200": {"description": "List of workflow instances"}}
                }
            },
            "/api/workflow/workflows/{workflow_id}/instances/{instance_id}": {
                "get": {
                    "tags": ["Workflows"], 
                    "summary": "Get workflow instance", 
                    "description": "Get specific workflow instance details", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}, 
                        {"name": "instance_id", "in": "path", "required": True, "schema": {"type": "string"}}
                    ], 
                    "responses": {"200": {"description": "Workflow instance details"}}
                },
                "delete": {
                    "tags": ["Workflows"], 
                    "summary": "Delete workflow instance", 
                    "description": "Delete a workflow instance", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}, 
                        {"name": "instance_id", "in": "path", "required": True, "schema": {"type": "string"}}
                    ], 
                    "responses": {"200": {"description": "Workflow instance deleted successfully"}}
                }
            },
            "/api/workflow/workflows/{workflow_id}/instances/{instance_id}/submit-task": {
                "post": {
                    "tags": ["Workflows"], 
                    "summary": "Submit workflow task", 
                    "description": "Submit task data for workflow instance", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}, 
                        {"name": "instance_id", "in": "path", "required": True, "schema": {"type": "string"}}
                    ], 
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}}, 
                    "responses": {"200": {"description": "Task submitted successfully"}}
                }
            },
            "/api/workflow/workflows/{workflow_id}/instances/{instance_id}/tasks/{task_id}/data": {
                "put": {
                    "tags": ["Workflows"], 
                    "summary": "Update workflow task data", 
                    "description": "Update data for a specific workflow task", 
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "workflow_id", "in": "path", "required": True, "schema": {"type": "string"}}, 
                        {"name": "instance_id", "in": "path", "required": True, "schema": {"type": "string"}}, 
                        {"name": "task_id", "in": "path", "required": True, "schema": {"type": "string"}}
                    ], 
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}}, 
                    "responses": {"200": {"description": "Task data updated successfully"}}
                }
            },

            # Workflow Config endpoints
            "/api/workflows/configs": {
                "get": {
                    "tags": ["Workflow Config"],
                    "summary": "List workflow configurations",
                    "description": "Get list of all workflow configurations",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 10}}
                    ],
                    "responses": {"200": {"description": "List of workflow configurations"}}
                },
                "post": {
                    "tags": ["Workflow Config"],
                    "summary": "Create workflow configuration",
                    "description": "Create a new workflow configuration",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "bpmn_xml": {"type": "string"}, "config": {"type": "object"}}}}}},
                    "responses": {"201": {"description": "Workflow configuration created successfully"}}
                }
            },
            "/api/workflows/configs/{config_id}": {
                "get": {
                    "tags": ["Workflow Config"],
                    "summary": "Get workflow configuration",
                    "description": "Get specific workflow configuration by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Workflow configuration details"}}
                },
                "put": {
                    "tags": ["Workflow Config"],
                    "summary": "Update workflow configuration",
                    "description": "Update existing workflow configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "bpmn_xml": {"type": "string"}, "config": {"type": "object"}}}}}},
                    "responses": {"200": {"description": "Workflow configuration updated successfully"}}
                },
                "delete": {
                    "tags": ["Workflow Config"],
                    "summary": "Delete workflow configuration",
                    "description": "Delete workflow configuration by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Workflow configuration deleted successfully"}}
                }
            },
            "/api/workflows/configs/{config_id}/bpmn": {
                "get": {
                    "tags": ["Workflow Config"],
                    "summary": "Get workflow BPMN",
                    "description": "Get BPMN XML for a specific workflow configuration",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "config_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "BPMN XML data", "content": {"application/xml": {"schema": {"type": "string"}}}}}
                }
            },
            "/api/workflows/categories": {
                "get": {
                    "tags": ["Workflow Config"],
                    "summary": "List workflow categories",
                    "description": "Get available workflow categories",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of workflow categories"}}
                }
            },
            "/api/workflows/health": {
                "get": {
                    "tags": ["Workflow Config"],
                    "summary": "Workflow config health",
                    "description": "Get workflow configuration system health status",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Workflow config health status"}}
                }
            },
            # Project Activities endpoints
            "/activities/fields-metadata": {
                "get": {
                    "tags": ["Project Activities"],
                    "summary": "Get activity fields metadata",
                    "description": "Get dynamically discovered field metadata from actual activity documents",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Field metadata"}}
                }
            },
            "/activities": {
                "get": {
                    "tags": ["Project Activities"],
                    "summary": "List project activities",
                    "description": "List project activities with pagination and filtering",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "project_id", "in": "query", "schema": {"type": "string"}},
                        {"name": "activity_type", "in": "query", "schema": {"type": "string"}},
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 50}},
                        {"name": "search", "in": "query", "schema": {"type": "string"}},
                        {"name": "status", "in": "query", "schema": {"type": "string"}},
                        {"name": "filters", "in": "query", "schema": {"type": "string"}},
                        {"name": "sort_by", "in": "query", "schema": {"type": "string", "default": "created_at"}},
                        {"name": "sort_order", "in": "query", "schema": {"type": "string", "default": "desc"}}
                    ],
                    "responses": {"200": {"description": "List of activities"}}
                },
                "post": {
                    "tags": ["Project Activities"],
                    "summary": "Create project activity",
                    "description": "Create a new project activity",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"201": {"description": "Activity created"}}
                }
            },
            "/activities/{activity_id}": {
                "get": {
                    "tags": ["Project Activities"],
                    "summary": "Get activity",
                    "description": "Get a specific activity by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "activity_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Activity details"}}
                },
                "put": {
                    "tags": ["Project Activities"],
                    "summary": "Update activity",
                    "description": "Update an activity",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "activity_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Activity updated"}}
                },
                "delete": {
                    "tags": ["Project Activities"],
                    "summary": "Delete activity",
                    "description": "Delete an activity",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "activity_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Activity deleted"}}
                }
            },
            # Activity Notifications endpoints
            "/activities/{activity_id}/notifications": {
                "get": {
                    "tags": ["Activity Notifications"],
                    "summary": "Get notifications for activity",
                    "description": "Get all notifications for an activity",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "activity_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "List of notifications"}}
                },
                "post": {
                    "tags": ["Activity Notifications"],
                    "summary": "Create notification for activity",
                    "description": "Create a new notification for an activity and send emails to mentioned users",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "activity_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"201": {"description": "Notification created"}}
                }
            },
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
            "/auth/change-password": {
                "post": {
                    "tags": ["Authentication"],
                    "summary": "Change password",
                    "description": "Change user password (requires authentication)",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"current_password": {"type": "string"}, "new_password": {"type": "string"}}, "required": ["current_password", "new_password"]}}}},
                    "responses": {"200": {"description": "Password changed successfully"}}
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
            "/auth/forgot-password": {
                "post": {
                    "tags": ["Authentication"],
                    "summary": "Forgot password",
                    "description": "Send password reset email to user",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string", "format": "email"}}, "required": ["email"]}}}},
                    "responses": {"200": {"description": "Reset link sent if email exists"}}
                }
            },
            "/auth/reset-password": {
                "post": {
                    "tags": ["Authentication"],
                    "summary": "Reset password",
                    "description": "Reset password using token from email",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"token": {"type": "string"}, "password": {"type": "string"}}, "required": ["token", "password"]}}}},
                    "responses": {"200": {"description": "Password reset successfully"}}
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
            "/api/users/set-password-invited": {
                "post": {
                    "tags": ["Users"],
                    "summary": "Set password for invited user",
                    "description": "Set password for an invited user",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"token": {"type": "string"}, "password": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Password set successfully"}}
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
            
            # Tenant Management
            "/api/tenant/my-tenant": {
                "get": {
                    "tags": ["Tenants"],
                    "summary": "Get my tenant",
                    "description": "Get current user's tenant information",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Tenant information"}}
                },
                "put": {
                    "tags": ["Tenants"],
                    "summary": "Update my tenant",
                    "description": "Update current user's tenant information",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "settings": {"type": "object"}}}}}},
                    "responses": {"200": {"description": "Tenant updated successfully"}}
                }
            },
            "/api/tenant/stats": {
                "get": {
                    "tags": ["Tenants"],
                    "summary": "Get tenant statistics",
                    "description": "Get statistics for current tenant",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Tenant statistics"}}
                }
            },
            "/api/tenant/users": {
                "get": {
                    "tags": ["Tenants"],
                    "summary": "Get tenant users",
                    "description": "Get users in current tenant",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of tenant users"}}
                }
            },
            "/api/tenant/roles": {
                "get": {
                    "tags": ["Tenants"],
                    "summary": "Get tenant roles",
                    "description": "Get roles in current tenant",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of tenant roles"}}
                }
            },
            "/api/tenant/activity": {
                "get": {
                    "tags": ["Tenants"],
                    "summary": "Get tenant activity",
                    "description": "Get activity for current tenant",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Tenant activity"}}
                }
            },
            # Project Management
            "/api/projects/fields-metadata": {
                "get": {
                    "tags": ["Projects"],
                    "summary": "Get project fields metadata",
                    "description": "Get dynamically discovered field metadata from actual project documents",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Project field metadata"}}
                }
            },
            "/api/projects": {
                "get": {
                    "tags": ["Projects"],
                    "summary": "List projects",
                    "description": "List projects with pagination and filtering",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "parent_id", "in": "query", "schema": {"type": "string"}},
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 20}},
                        {"name": "search", "in": "query", "schema": {"type": "string"}},
                        {"name": "status", "in": "query", "schema": {"type": "string"}},
                        {"name": "sort_by", "in": "query", "schema": {"type": "string", "default": "name"}},
                        {"name": "sort_order", "in": "query", "schema": {"type": "string", "default": "asc"}}
                    ],
                    "responses": {"200": {"description": "List of projects"}}
                },
                "post": {
                    "tags": ["Projects"],
                    "summary": "Create project",
                    "description": "Create a new project",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"201": {"description": "Project created successfully"}}
                }
            },
            "/api/projects/tree": {
                "get": {
                    "tags": ["Projects"],
                    "summary": "Get project tree",
                    "description": "Get hierarchical project tree with server-side filtering, sorting, and pagination",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "root_id", "in": "query", "schema": {"type": "string", "default": "root"}},
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 20}},
                        {"name": "filters", "in": "query", "schema": {"type": "string"}},
                        {"name": "sort_field", "in": "query", "schema": {"type": "string"}},
                        {"name": "sort_order", "in": "query", "schema": {"type": "string", "default": "asc"}}
                    ],
                    "responses": {"200": {"description": "Project tree structure"}}
                }
            },
            "/api/projects/{project_id}": {
                "get": {
                    "tags": ["Projects"],
                    "summary": "Get project",
                    "description": "Get a specific project by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Project details"}}
                },
                "put": {
                    "tags": ["Projects"],
                    "summary": "Update project",
                    "description": "Update a project",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Project updated successfully"}}
                },
                "delete": {
                    "tags": ["Projects"],
                    "summary": "Delete project",
                    "description": "Delete a project",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "project_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Project deleted successfully"}}
                }
            },
            "/api/rbac/invite-user": {
                "post": {
                    "tags": ["Role Management"],
                    "summary": "Invite user",
                    "description": "Invite a new user to the tenant with specific roles",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}, "roleIds": {"type": "array", "items": {"type": "string"}}}}}}},
                    "responses": {"200": {"description": "User invited successfully"}}
                }
            },
            "/api/rbac/users": {
                "get": {
                    "tags": ["Role Management"],
                    "summary": "List users with roles",
                    "description": "Get list of users with their assigned roles",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of users with roles"}}
                }
            },
            "/api/rbac/users/{user_id}/roles/assign": {
                "post": {
                    "tags": ["Role Management"],
                    "summary": "Assign role to user",
                    "description": "Assign specific role to a user",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"roleId": {"type": "string"}}}}}},
                    "responses": {"200": {"description": "Role assigned successfully"}}
                }
            },
            "/api/rbac/users/{user_id}/roles/{role_id}": {
                "delete": {
                    "tags": ["Role Management"],
                    "summary": "Remove role from user",
                    "description": "Remove specific role from a user",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}},
                        {"name": "role_id", "in": "path", "required": True, "schema": {"type": "string"}}
                    ],
                    "responses": {"200": {"description": "Role removed successfully"}}
                }
            },
            "/api/rbac/users/{user_id}": {
                "delete": {
                    "tags": ["Role Management"],
                    "summary": "Delete user",
                    "description": "Delete a user by ID",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "User deleted successfully"}}
                }
            },

            # Dynamic Execution
            "/api/dynamic/modules": {
                "get": {
                    "tags": ["Dynamic Execution"],
                    "summary": "List modules",
                    "description": "List available dynamic execution modules",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of available modules"}}
                }
            },
            "/api/dynamic/modules/{module_name}/functions": {
                "get": {
                    "tags": ["Dynamic Execution"],
                    "summary": "List module functions",
                    "description": "List functions available in a specific module",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "module_name", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "List of functions in the module"}}
                }
            },
            "/api/dynamic/execute": {
                "post": {
                    "tags": ["Dynamic Execution"],
                    "summary": "Execute function",
                    "description": "Execute a function from a dynamic module",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"module_name": {"type": "string"}, "function_name": {"type": "string"}, "args": {"type": "array"}, "kwargs": {"type": "object"}}}}}},
                    "responses": {"200": {"description": "Function execution result"}}
                }
            },

            # Scheduler Management
            "/api/scheduler/jobs": {
                "get": {
                    "tags": ["Scheduler"],
                    "summary": "List scheduled jobs",
                    "description": "List all scheduled jobs",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of scheduled jobs"}}
                },
                "post": {
                    "tags": ["Scheduler"],
                    "summary": "Create scheduled job",
                    "description": "Create a new scheduled job",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"201": {"description": "Job created successfully"}}
                }
            },
            "/api/scheduler/jobs/{job_id}": {
                "get": {
                    "tags": ["Scheduler"],
                    "summary": "Get scheduled job",
                    "description": "Get details of a specific scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Job details"}}
                },
                "put": {
                    "tags": ["Scheduler"],
                    "summary": "Update scheduled job",
                    "description": "Update an existing scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Job updated successfully"}}
                },
                "delete": {
                    "tags": ["Scheduler"],
                    "summary": "Delete scheduled job",
                    "description": "Delete a scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Job deleted successfully"}}
                }
            },
            "/api/scheduler/jobs/{job_id}/pause": {
                "post": {
                    "tags": ["Scheduler"],
                    "summary": "Pause scheduled job",
                    "description": "Pause a scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Job paused successfully"}}
                }
            },
            "/api/scheduler/jobs/{job_id}/resume": {
                "post": {
                    "tags": ["Scheduler"],
                    "summary": "Resume scheduled job",
                    "description": "Resume a paused scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Job resumed successfully"}}
                }
            },
            "/api/scheduler/jobs/{job_id}/run": {
                "post": {
                    "tags": ["Scheduler"],
                    "summary": "Run scheduled job now",
                    "description": "Trigger immediate execution of a scheduled job",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Job execution triggered"}}
                }
            },
            "/api/scheduler/status": {
                "get": {
                    "tags": ["Scheduler"],
                    "summary": "Get scheduler status",
                    "description": "Get current scheduler status and statistics",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Scheduler status information"}}
                }
            },
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
            "/api/models/categories": {
                "get": {
                    "tags": ["Models"],
                    "summary": "List model categories",
                    "description": "Get all unique categories for model configurations",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "List of model categories"}}
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
            "/api/payments/checkout-session": {
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
            "/api/payments/subscription-status": {
                "get": {
                    "tags": ["Payments"],
                    "summary": "Get subscription status",
                    "description": "Get current user's subscription status",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Subscription status information"}}
                }
            },
            
            # File uploads
            "/api/upload": {
                "post": {
                    "tags": ["Uploads"],
                    "summary": "Upload files",
                    "description": "Upload files to the platform with user email prefix and role-based access control",
                    "security": [{"BearerAuth": []}],
                    "requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"files": {"type": "array", "items": {"type": "string", "format": "binary"}}}}}}},
                    "responses": {"200": {"description": "Files uploaded successfully"}}
                }
            },
            "/api/upload/{path:path}": {
                "post": {
                    "tags": ["Uploads"],
                    "summary": "Upload files to specific path",
                    "description": "Upload files to a specific path",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "path", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"files": {"type": "array", "items": {"type": "string", "format": "binary"}}}}}}},
                    "responses": {"200": {"description": "Files uploaded successfully"}}
                }
            },
            "/api/files": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "List uploaded files",
                    "description": "Get list of uploaded files with pagination",
                    "security": [{"BearerAuth": []}],
                    "parameters": [
                        {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                        {"name": "page_size", "in": "query", "schema": {"type": "integer", "default": 10}}
                    ],
                    "responses": {"200": {"description": "List of uploaded files"}}
                }
            },
            "/api/files/{filename}": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "Download file",
                    "description": "Download specific file by filename",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "File content"}}
                }
            },
            "/api/download/{file_path:path}": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "Download file by path",
                    "description": "Download file by complete file path",
                    "security": [{"BearerAuth": []}],
                    "parameters": [{"name": "file_path", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "File content"}}
                }
            },
            "/api/diag": {
                "get": {
                    "tags": ["Uploads"],
                    "summary": "Upload diagnostics",
                    "description": "Get upload system diagnostics",
                    "security": [{"BearerAuth": []}],
                    "responses": {"200": {"description": "Diagnostics information"}}
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