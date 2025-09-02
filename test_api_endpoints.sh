#!/bin/bash

# GIA Platform Comprehensive API Test Script
# Tests ALL endpoints in the exact order they're included in main.py

API_BASE="http://localhost:4000"
USER_EMAIL="test@example.com"
USER_PASSWORD="testpassword123"
ADMIN_USER="admin"
ADMIN_PASS="123"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo "🚀 GIA Platform COMPREHENSIVE API Test Script"
echo "=============================================="
echo "Testing ALL routes in order:"
echo "1. auth_router (prefix: /auth)"
echo "2. users_router (prefix: /api/users)"
echo "3. payments_router (no prefix)"
echo "4. uploads_router (no prefix)"
echo "5. profile_router (no prefix - /api prefix in router)"
echo "6. roles_router (no prefix - /api prefix in router)"
echo "7. role_management_router (prefix: /api/rbac)"
echo "8. menu_router (no prefix - /api prefix in router)"
echo "9. discovery_router (no prefix - /api/discovery prefix in router)"
echo "10. model_config_router (no prefix - /api/model-config prefix in router)"
echo "11. tool_config_router (no prefix - /api/tool-config prefix in router)"
echo "12. knowledge_router (no prefix - /api/knowledge prefix in router)"
echo "13. agents_router (no prefix - /api/agents prefix in router)"
echo "14. agent_runtime_router (no prefix - /api/agent-runtime prefix in router)"
echo "=============================================="

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local token="$4"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
    echo "[$TOTAL_TESTS] Testing: $name"
    echo "Endpoint: $method $endpoint"
    
    if [ -n "$token" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X "$method" "$API_BASE$endpoint" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$data")
        else
            response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X "$method" "$API_BASE$endpoint" -H "Authorization: Bearer $token")
        fi
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X "$method" "$API_BASE$endpoint" -H "Content-Type: application/json" -d "$data")
        else
            response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X "$method" "$API_BASE$endpoint")
        fi
    fi
    
    # Parse response and status
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    if [[ $http_status -ge 200 && $http_status -lt 300 ]]; then
        echo "✅ SUCCESS ($http_status)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    else
        echo "❌ FAILED ($http_status)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "$response_body"
    fi
}

# Test 1: Health check
test_endpoint "Health Check" "GET" "/health" "" ""

# Test 2: Root endpoint
test_endpoint "Root Endpoint" "GET" "/" "" ""

# ============================================== 
# AUTHENTICATION SETUP
# ==============================================

echo ""
echo "🔐 AUTHENTICATION SETUP"
echo "=============================================="

# Get admin token
echo "Getting admin token..."
admin_login_data='{"username":"'$ADMIN_USER'","password":"'$ADMIN_PASS'"}'
admin_response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d "$admin_login_data")
admin_status=$(echo "$admin_response" | grep "HTTP_STATUS:" | cut -d: -f2)
admin_body=$(echo "$admin_response" | sed '/HTTP_STATUS:/d')

if [[ $admin_status -eq 200 ]]; then
    ADMIN_TOKEN=$(echo "$admin_body" | jq -r '.token')
    echo "✅ Admin token obtained"
else
    echo "❌ Failed to get admin token ($admin_status): $admin_body"
    ADMIN_TOKEN=""
fi

# Get user token (if user exists)
echo "Getting user token..."
user_login_data='{"username":"'$USER_EMAIL'","password":"'$USER_PASSWORD'"}'
user_response=$(curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d "$user_login_data")
user_status=$(echo "$user_response" | grep "HTTP_STATUS:" | cut -d: -f2)
user_body=$(echo "$user_response" | sed '/HTTP_STATUS:/d')

if [[ $user_status -eq 200 ]]; then
    USER_TOKEN=$(echo "$user_body" | jq -r '.token')
    echo "✅ User token obtained"
else
    echo "⚠️ User not found or login failed ($user_status): $user_body"
    echo "You'll need to create the dummy user first"
    USER_TOKEN=""
fi

# ============================================== 
# 1. AUTH ROUTER TESTS (prefix: /auth)
# ==============================================

echo ""
echo "=============================================="
echo "🔐 1. AUTH ROUTER TESTS (/auth)"
echo "=============================================="

# Test auth login (already tested above but include in formal test)
test_endpoint "Auth Login - Admin" "POST" "/auth/login" "" "$admin_login_data"

if [ -n "$USER_TOKEN" ]; then
    test_endpoint "Auth Login - User" "POST" "/auth/login" "" "$user_login_data"
fi

# Test Google OAuth redirect
test_endpoint "Google OAuth Redirect" "GET" "/auth/google" "" ""

# Test auth/me endpoint
if [ -n "$ADMIN_TOKEN" ]; then
    test_endpoint "Auth Me - Admin" "GET" "/auth/me" "$ADMIN_TOKEN" ""
fi

if [ -n "$USER_TOKEN" ]; then
    test_endpoint "Auth Me - User" "GET" "/auth/me" "$USER_TOKEN" ""
fi

# Test logout
if [ -n "$USER_TOKEN" ]; then
    test_endpoint "Auth Logout" "POST" "/auth/logout" "$USER_TOKEN" ""
fi

# ============================================== 
# 2. USERS ROUTER TESTS (prefix: /api/users)
# ==============================================

echo ""
echo "=============================================="
echo "👥 2. USERS ROUTER TESTS (/api/users)"
echo "=============================================="

if [ -n "$ADMIN_TOKEN" ]; then
    # Create user
    create_user_data='{"email":"testuser@example.com","password":"testpass123","name":"Test User","role":"user"}'
    test_endpoint "Create User" "POST" "/api/users/" "$ADMIN_TOKEN" "$create_user_data"
    
    # Get all users
    test_endpoint "Get All Users" "GET" "/api/users/" "$ADMIN_TOKEN" ""
    
    # Verify user
    verify_data='{"email":"testuser@example.com","verification_code":"123456"}'
    test_endpoint "Verify User" "POST" "/api/users/verify" "$ADMIN_TOKEN" "$verify_data"
    
    # Login user (through users endpoint)
    user_login='{"username":"testuser@example.com","password":"testpass123"}'
    test_endpoint "User Login (users endpoint)" "POST" "/api/users/login" "" "$user_login"
    
    # Test deprecated patient endpoints
    test_endpoint "Create Patient (Deprecated)" "POST" "/api/users/patients" "$ADMIN_TOKEN" "{}"
    test_endpoint "Verify Patient (Deprecated)" "POST" "/api/users/patients/verify" "$ADMIN_TOKEN" "{}"
    test_endpoint "Patient Login (Deprecated)" "POST" "/api/users/patients/login" "" "{}"
    test_endpoint "Get Patients (Deprecated)" "GET" "/api/users/patients" "$ADMIN_TOKEN" ""
else
    echo "⚠️ Skipping user tests (no admin token)"
fi

# ============================================== 
# 3. PAYMENTS ROUTER TESTS (no prefix)
# ==============================================

echo ""
echo "=============================================="
echo "💳 3. PAYMENTS ROUTER TESTS"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Test checkout session
    checkout_data='{"plan":"basic","success_url":"http://localhost:3000/success","cancel_url":"http://localhost:3000/cancel"}'
    test_endpoint "Create Checkout Session" "POST" "/checkout-session" "$USER_TOKEN" "$checkout_data"
else
    echo "⚠️ Skipping payment tests (no user token)"
fi

# ============================================== 
# 4. UPLOADS ROUTER TESTS (no prefix) 
# ==============================================

echo ""
echo "=============================================="
echo "📁 4. UPLOADS ROUTER TESTS"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Test file upload (without actual file)
    test_endpoint "Upload File (no file)" "POST" "/upload" "$USER_TOKEN" ""
    
    # Get files
    test_endpoint "Get Files" "GET" "/files" "$USER_TOKEN" ""
    
    # Get specific file (will likely fail)
    test_endpoint "Get Specific File" "GET" "/files/test.txt" "$USER_TOKEN" ""
    
    # Diagnostics
    test_endpoint "Upload Diagnostics" "GET" "/diag" "$USER_TOKEN" ""
else
    echo "⚠️ Skipping upload tests (no user token)"
fi

# ============================================== 
# 5. PROFILE ROUTER TESTS (/api prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "👤 5. PROFILE ROUTER TESTS (/api)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get profile
    test_endpoint "Get User Profile" "GET" "/api/profile" "$USER_TOKEN" ""
    
    # Update profile
    profile_update='{"name":"Updated Name","bio":"Updated bio"}'
    test_endpoint "Update Profile" "PUT" "/api/profile" "$USER_TOKEN" "$profile_update"
    
    # Get profile completeness
    test_endpoint "Profile Completeness" "GET" "/api/profile/completeness" "$USER_TOKEN" ""
else
    echo "⚠️ Skipping profile tests (no user token)"
fi

# ============================================== 
# 6. ROLES ROUTER TESTS (/api prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🔐 6. ROLES ROUTER TESTS (/api)"
echo "=============================================="

if [ -n "$ADMIN_TOKEN" ]; then
    # Get all roles
    test_endpoint "Get All Roles" "GET" "/api/roles" "$ADMIN_TOKEN" ""
    
    # Create role
    role_data='{"name":"test_role","permissions":["read","write"],"description":"Test role"}'
    test_endpoint "Create Role" "POST" "/api/roles" "$ADMIN_TOKEN" "$role_data"
    
    # Update role (using a test role ID)
    role_update='{"name":"updated_role","permissions":["read"],"description":"Updated role"}'
    test_endpoint "Update Role" "PUT" "/api/roles/test_role_id" "$ADMIN_TOKEN" "$role_update"
    
    # Delete role
    test_endpoint "Delete Role" "DELETE" "/api/roles/test_role_id" "$ADMIN_TOKEN" ""
    
    # Assign role to user
    assign_data='{"user_id":"test_user_id","role_id":"test_role_id"}'
    test_endpoint "Assign Role" "POST" "/api/roles/assign" "$ADMIN_TOKEN" "$assign_data"
    
    # Remove role from user
    remove_data='{"user_id":"test_user_id","role_id":"test_role_id"}'
    test_endpoint "Remove Role Assignment" "DELETE" "/api/roles/assign" "$ADMIN_TOKEN" "$remove_data"
    
    # Get user roles
    test_endpoint "Get User Roles" "GET" "/api/users/test_user_id/roles" "$ADMIN_TOKEN" ""
else
    echo "⚠️ Skipping role tests (no admin token)"
fi

if [ -n "$USER_TOKEN" ]; then
    # Get my roles
    test_endpoint "Get My Roles" "GET" "/api/roles/my-roles" "$USER_TOKEN" ""
fi

# ============================================== 
# 7. ROLE MANAGEMENT ROUTER TESTS (prefix: /api/rbac)
# ==============================================

echo ""
echo "=============================================="
echo "👑 7. ROLE MANAGEMENT ROUTER TESTS (/api/rbac)"
echo "=============================================="

if [ -n "$ADMIN_TOKEN" ]; then
    # Invite user
    invite_data='{"email":"invite@example.com","role_id":"user_role_id"}'
    test_endpoint "Invite User" "POST" "/api/rbac/invite-user" "$ADMIN_TOKEN" "$invite_data"
    
    # Get RBAC users
    test_endpoint "Get RBAC Users" "GET" "/api/rbac/users" "$ADMIN_TOKEN" ""
    
    # Assign role to user
    assign_rbac_data='{"role_id":"test_role_id"}'
    test_endpoint "RBAC Assign Role" "POST" "/api/rbac/users/test_user_id/roles/assign" "$ADMIN_TOKEN" "$assign_rbac_data"
    
    # Remove role from user
    test_endpoint "RBAC Remove Role" "DELETE" "/api/rbac/users/test_user_id/roles/test_role_id" "$ADMIN_TOKEN" ""
else
    echo "⚠️ Skipping RBAC tests (no admin token)"
fi

# ============================================== 
# 8. MENU ROUTER TESTS (/api prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "📋 8. MENU ROUTER TESTS (/api)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get menu items
    test_endpoint "Get Menu Items" "GET" "/api/menu-items" "$USER_TOKEN" ""
fi

if [ -n "$ADMIN_TOKEN" ]; then
    # Create menu item
    menu_data='{"title":"Test Menu","path":"/test","icon":"test-icon","order":10}'
    test_endpoint "Create Menu Item" "POST" "/api/menu-items" "$ADMIN_TOKEN" "$menu_data"
    
    # Update menu item
    menu_update='{"title":"Updated Menu","path":"/updated","icon":"updated-icon","order":20}'
    test_endpoint "Update Menu Item" "PUT" "/api/menu-items/test_item_id" "$ADMIN_TOKEN" "$menu_update"
    
    # Delete menu item
    test_endpoint "Delete Menu Item" "DELETE" "/api/menu-items/test_item_id" "$ADMIN_TOKEN" ""
    
    # Reorder menu items
    reorder_data='{"items":[{"id":"item1","order":1},{"id":"item2","order":2}]}'
    test_endpoint "Reorder Menu Items" "PUT" "/api/menu-items/reorder" "$ADMIN_TOKEN" "$reorder_data"
    
    # Seed menu items
    test_endpoint "Seed Menu Items" "POST" "/api/menu-items/seed" "$ADMIN_TOKEN" ""
else
    echo "⚠️ Skipping admin menu tests (no admin token)"
fi

# ============================================== 
# 9. DISCOVERY ROUTER TESTS (/api/discovery prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🔍 9. DISCOVERY ROUTER TESTS (/api/discovery)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get components
    test_endpoint "Get Discovery Components" "GET" "/api/discovery/components" "$USER_TOKEN" ""
    
    # Get components with folder
    test_endpoint "Get Discovery Components (ai folder)" "GET" "/api/discovery/components?folder=ai" "$USER_TOKEN" ""
    
    # Introspect module
    introspect_data='{"module_path":"ai.llm.openai","kind":"model"}'
    test_endpoint "Introspect Module" "POST" "/api/discovery/introspect" "$USER_TOKEN" "$introspect_data"
else
    echo "⚠️ Skipping discovery tests (no user token)"
fi

# ============================================== 
# 10. MODEL CONFIG ROUTER TESTS (/api/model-config prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🤖 10. MODEL CONFIG ROUTER TESTS (/api/model-config)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get model configs
    test_endpoint "Get Model Configs" "GET" "/api/model-config/configs" "$USER_TOKEN" ""
    
    # Get model categories
    test_endpoint "Get Model Categories" "GET" "/api/model-config/categories" "$USER_TOKEN" ""
    
    # Get model components
    test_endpoint "Get Model Components" "GET" "/api/model-config/components" "$USER_TOKEN" ""
    
    # Create model config
    model_config_data='{"name":"test_model","provider":"openai","model":"gpt-3.5-turbo","api_key":"test_key"}'
    test_endpoint "Create Model Config" "POST" "/api/model-config/configs" "$USER_TOKEN" "$model_config_data"
    
    # Get specific model config
    test_endpoint "Get Model Config" "GET" "/api/model-config/configs/test_config_id" "$USER_TOKEN" ""
    
    # Update model config
    model_update='{"name":"updated_model","provider":"openai","model":"gpt-4","api_key":"updated_key"}'
    test_endpoint "Update Model Config" "PUT" "/api/model-config/configs/test_config_id" "$USER_TOKEN" "$model_update"
    
    # Delete model config
    test_endpoint "Delete Model Config" "DELETE" "/api/model-config/configs/test_config_id" "$USER_TOKEN" ""
    
    # Introspect model
    model_introspect='{"module_path":"ai.llm.openai","kind":"model"}'
    test_endpoint "Introspect Model" "POST" "/api/model-config/introspect" "$USER_TOKEN" "$model_introspect"
else
    echo "⚠️ Skipping model config tests (no user token)"
fi

# ============================================== 
# 11. TOOL CONFIG ROUTER TESTS (/api/tool-config prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🔧 11. TOOL CONFIG ROUTER TESTS (/api/tool-config)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get tool configs
    test_endpoint "Get Tool Configs" "GET" "/api/tool-config/configs" "$USER_TOKEN" ""
    
    # Get tool categories
    test_endpoint "Get Tool Categories" "GET" "/api/tool-config/categories" "$USER_TOKEN" ""
    
    # Get tool components
    test_endpoint "Get Tool Components" "GET" "/api/tool-config/components" "$USER_TOKEN" ""
    
    # Create tool config
    tool_config_data='{"name":"test_tool","provider":"tavily","api_key":"test_key"}'
    test_endpoint "Create Tool Config" "POST" "/api/tool-config/configs" "$USER_TOKEN" "$tool_config_data"
    
    # Get specific tool config
    test_endpoint "Get Tool Config" "GET" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Update tool config
    tool_update='{"name":"updated_tool","provider":"tavily","api_key":"updated_key"}'
    test_endpoint "Update Tool Config" "PUT" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" "$tool_update"
    
    # Delete tool config
    test_endpoint "Delete Tool Config" "DELETE" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Introspect tool
    tool_introspect='{"module_path":"ai.tools.tavily","kind":"tool"}'
    test_endpoint "Introspect Tool" "POST" "/api/tool-config/introspect" "$USER_TOKEN" "$tool_introspect"
# ============================================== 
# 12. KNOWLEDGE ROUTER TESTS (/api/knowledge prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "📚 12. KNOWLEDGE ROUTER TESTS (/api/knowledge)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get knowledge components
    test_endpoint "Get Knowledge Components" "GET" "/api/knowledge/components" "$USER_TOKEN" ""
    
    # Get knowledge categories
    test_endpoint "Get Knowledge Categories" "GET" "/api/knowledge/categories" "$USER_TOKEN" ""
    
    # Get knowledge prefixes
    test_endpoint "Get Knowledge Prefixes" "GET" "/api/knowledge/prefixes" "$USER_TOKEN" ""
    
    # Get specific prefix
    test_endpoint "Get Specific Prefix" "GET" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Create prefix
    prefix_data='{"name":"test_prefix","description":"Test prefix","config":{}}'
    test_endpoint "Create Knowledge Prefix" "POST" "/api/knowledge/prefixes" "$USER_TOKEN" "$prefix_data"
    
    # Delete prefix
    test_endpoint "Delete Knowledge Prefix" "DELETE" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (without file)
    test_endpoint "Upload Knowledge (no file)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Get knowledge defaults
    test_endpoint "Get Knowledge Defaults" "GET" "/api/knowledge/defaults" "$USER_TOKEN" ""
    
    # Get knowledge prefix info
    test_endpoint "Get Knowledge Prefix Info" "GET" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Save knowledge prefix
    save_data='{"prefix":"test_prefix","config":{},"documents":[]}'
    test_endpoint "Save Knowledge Prefix" "POST" "/api/knowledge/prefix/save" "$USER_TOKEN" "$save_data"
    
    # Delete knowledge prefix
    test_endpoint "Delete Knowledge Prefix (alt)" "DELETE" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (alt endpoint)
    test_endpoint "Upload Knowledge (alt endpoint)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Knowledge diagnostics
    test_endpoint "Knowledge Diagnostics" "GET" "/api/knowledge/diag" "$USER_TOKEN" ""
    
    # Introspect knowledge
    knowledge_introspect='{"module_path":"ai.knowledge.pdf","kind":"knowledge"}'
    test_endpoint "Introspect Knowledge" "POST" "/api/knowledge/introspect" "$USER_TOKEN" "$knowledge_introspect"
else
    echo "⚠️ Skipping knowledge tests (no user token)"
fi

# ============================================== 
# 13. AGENTS ROUTER TESTS (/api/agents prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🤖 13. AGENTS ROUTER TESTS (/api/agents)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get all agents
    test_endpoint "Get All Agents" "GET" "/api/agents" "$USER_TOKEN" ""
    
    # Get specific agent
    test_endpoint "Get Specific Agent" "GET" "/api/agents/test_agent" "$USER_TOKEN" ""
    
    # Create agent
    agent_data='{"name":"test_agent","description":"Test agent","config":{}}'
    test_endpoint "Create Agent" "POST" "/api/agents" "$USER_TOKEN" "$agent_data"
    
    # Delete agent
    test_endpoint "Delete Agent" "DELETE" "/api/agents/test_agent" "$USER_TOKEN" ""
else
    echo "⚠️ Skipping agent tests (no user token)"
fi

# ============================================== 
# 11. TOOL CONFIG ROUTER TESTS (/api/tool-config)
# ==============================================

echo ""
echo "=============================================="
echo "🔧 11. TOOL CONFIG ROUTER TESTS (/api/tool-config)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get tool configs
    test_endpoint "Get Tool Configs" "GET" "/api/tool-config/configs" "$USER_TOKEN" ""
    
    # Get tool categories
    test_endpoint "Get Tool Categories" "GET" "/api/tool-config/categories" "$USER_TOKEN" ""
    
    # Get tool components
    test_endpoint "Get Tool Components" "GET" "/api/tool-config/components" "$USER_TOKEN" ""
    
    # Create tool config
    tool_config_data='{"name":"test_tool","provider":"tavily","api_key":"test_key"}'
    test_endpoint "Create Tool Config" "POST" "/api/tool-config/configs" "$USER_TOKEN" "$tool_config_data"
    
    # Get specific tool config
    test_endpoint "Get Tool Config" "GET" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Update tool config
    tool_update='{"name":"updated_tool","provider":"tavily","api_key":"updated_key"}'
    test_endpoint "Update Tool Config" "PUT" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" "$tool_update"
    
    # Delete tool config
    test_endpoint "Delete Tool Config" "DELETE" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Introspect tool
    tool_introspect='{"module_path":"ai.tools.tavily","kind":"tool"}'
    test_endpoint "Introspect Tool" "POST" "/api/tool-config/introspect" "$USER_TOKEN" "$tool_introspect"
else
    echo "⚠️ Skipping tool config tests (no user token)"
fi

# ============================================== 
# 12. KNOWLEDGE ROUTER TESTS (/api/knowledge prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "📚 12. KNOWLEDGE ROUTER TESTS (/api/knowledge)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get knowledge components
    test_endpoint "Get Knowledge Components" "GET" "/api/knowledge/components" "$USER_TOKEN" ""
    
    # Get knowledge categories
    test_endpoint "Get Knowledge Categories" "GET" "/api/knowledge/categories" "$USER_TOKEN" ""
    
    # Get knowledge prefixes
    test_endpoint "Get Knowledge Prefixes" "GET" "/api/knowledge/prefixes" "$USER_TOKEN" ""
    
    # Get specific prefix
    test_endpoint "Get Specific Prefix" "GET" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Create prefix
    prefix_data='{"name":"test_prefix","description":"Test prefix","config":{}}'
    test_endpoint "Create Knowledge Prefix" "POST" "/api/knowledge/prefixes" "$USER_TOKEN" "$prefix_data"
    
    # Delete prefix
    test_endpoint "Delete Knowledge Prefix" "DELETE" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (without file)
    test_endpoint "Upload Knowledge (no file)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Get knowledge defaults
    test_endpoint "Get Knowledge Defaults" "GET" "/api/knowledge/defaults" "$USER_TOKEN" ""
    
    # Get knowledge prefix info
    test_endpoint "Get Knowledge Prefix Info" "GET" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Save knowledge prefix
    save_data='{"prefix":"test_prefix","config":{},"documents":[]}'
    test_endpoint "Save Knowledge Prefix" "POST" "/api/knowledge/prefix/save" "$USER_TOKEN" "$save_data"
    
    # Delete knowledge prefix
    test_endpoint "Delete Knowledge Prefix (alt)" "DELETE" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (alt endpoint)
    test_endpoint "Upload Knowledge (alt endpoint)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Knowledge diagnostics
    test_endpoint "Knowledge Diagnostics" "GET" "/api/knowledge/diag" "$USER_TOKEN" ""
    
    # Introspect knowledge
    knowledge_introspect='{"module_path":"ai.knowledge.pdf","kind":"knowledge"}'
    test_endpoint "Introspect Knowledge" "POST" "/api/knowledge/introspect" "$USER_TOKEN" "$knowledge_introspect"
else
    echo "⚠️ Skipping knowledge tests (no user token)"
fi

# ============================================== 
# 13. AGENTS ROUTER TESTS (/api/agents prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🤖 13. AGENTS ROUTER TESTS (/api/agents)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get all agents
    test_endpoint "Get All Agents" "GET" "/api/agents" "$USER_TOKEN" ""
    
    # Get specific agent
    test_endpoint "Get Specific Agent" "GET" "/api/agents/test_agent" "$USER_TOKEN" ""
    
    # Create agent
    agent_data='{"name":"test_agent","description":"Test agent","config":{}}'
    test_endpoint "Create Agent" "POST" "/api/agents" "$USER_TOKEN" "$agent_data"
    
    # Delete agent
    test_endpoint "Delete Agent" "DELETE" "/api/agents/test_agent" "$USER_TOKEN" ""
else
    echo "⚠️ Skipping agent tests (no user token)"
fi

# ============================================== 
# 14. AGENT RUNTIME ROUTER TESTS (/api/agent-runtime prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🚀 14. AGENT RUNTIME ROUTER TESTS (/api/agent-runtime)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get conversations
    test_endpoint "Get Agent Conversations" "GET" "/api/agent-runtime/conversations" "$USER_TOKEN" ""
    
    # Get specific conversation
    test_endpoint "Get Specific Conversation" "GET" "/api/agent-runtime/conversations/test_conv_id" "$USER_TOKEN" ""
    
    # Create conversation
    conv_data='{"agent_name":"test_agent","title":"Test Conversation"}'
    test_endpoint "Create Conversation" "POST" "/api/agent-runtime/conversations" "$USER_TOKEN" "$conv_data"
    
    # Delete conversation
    test_endpoint "Delete Conversation" "DELETE" "/api/agent-runtime/conversations/test_conv_id" "$USER_TOKEN" ""
    
    # Run agent
    run_data='{"agent_name":"test_agent","message":"Hello","conversation_id":"test_conv_id"}'
    test_endpoint "Run Agent" "POST" "/api/agent-runtime/run" "$USER_TOKEN" "$run_data"
else
    echo "⚠️ Skipping agent runtime tests (no user token)"
fi

if [ -n "$USER_TOKEN" ]; then
    # Get tool configs
    test_endpoint "Get Tool Configs" "GET" "/api/tool-config/configs" "$USER_TOKEN" ""
    
    # Get tool categories
    test_endpoint "Get Tool Categories" "GET" "/api/tool-config/categories" "$USER_TOKEN" ""
    
    # Get tool components
    test_endpoint "Get Tool Components" "GET" "/api/tool-config/components" "$USER_TOKEN" ""
    
    # Create tool config
    tool_config_data='{"name":"test_tool","provider":"tavily","api_key":"test_key"}'
    test_endpoint "Create Tool Config" "POST" "/api/tool-config/configs" "$USER_TOKEN" "$tool_config_data"
    
    # Get specific tool config
    test_endpoint "Get Tool Config" "GET" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Update tool config
    tool_update='{"name":"updated_tool","provider":"tavily","api_key":"updated_key"}'
    test_endpoint "Update Tool Config" "PUT" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" "$tool_update"
    
    # Delete tool config
    test_endpoint "Delete Tool Config" "DELETE" "/api/tool-config/configs/test_tool_id" "$USER_TOKEN" ""
    
    # Introspect tool
    tool_introspect='{"module_path":"ai.tools.tavily","kind":"tool"}'
    test_endpoint "Introspect Tool" "POST" "/api/tool-config/introspect" "$USER_TOKEN" "$tool_introspect"
else
    echo "⚠️ Skipping tool config tests (no user token)"
fi

# ============================================== 
# 12. KNOWLEDGE ROUTER TESTS (/api/knowledge prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "📚 12. KNOWLEDGE ROUTER TESTS (/api/knowledge)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get knowledge components
    test_endpoint "Get Knowledge Components" "GET" "/api/knowledge/components" "$USER_TOKEN" ""
    
    # Get knowledge categories
    test_endpoint "Get Knowledge Categories" "GET" "/api/knowledge/categories" "$USER_TOKEN" ""
    
    # Get knowledge prefixes
    test_endpoint "Get Knowledge Prefixes" "GET" "/api/knowledge/prefixes" "$USER_TOKEN" ""
    
    # Get specific prefix
    test_endpoint "Get Specific Prefix" "GET" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Create prefix
    prefix_data='{"name":"test_prefix","description":"Test prefix","config":{}}'
    test_endpoint "Create Knowledge Prefix" "POST" "/api/knowledge/prefixes" "$USER_TOKEN" "$prefix_data"
    
    # Delete prefix
    test_endpoint "Delete Knowledge Prefix" "DELETE" "/api/knowledge/prefixes/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (without file)
    test_endpoint "Upload Knowledge (no file)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Get knowledge defaults
    test_endpoint "Get Knowledge Defaults" "GET" "/api/knowledge/defaults" "$USER_TOKEN" ""
    
    # Get knowledge prefix info
    test_endpoint "Get Knowledge Prefix Info" "GET" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Save knowledge prefix
    save_data='{"prefix":"test_prefix","config":{},"documents":[]}'
    test_endpoint "Save Knowledge Prefix" "POST" "/api/knowledge/prefix/save" "$USER_TOKEN" "$save_data"
    
    # Delete knowledge prefix
    test_endpoint "Delete Knowledge Prefix (alt)" "DELETE" "/api/knowledge/prefix/test_prefix" "$USER_TOKEN" ""
    
    # Upload knowledge (alt endpoint)
    test_endpoint "Upload Knowledge (alt endpoint)" "POST" "/api/knowledge/upload" "$USER_TOKEN" ""
    
    # Knowledge diagnostics
    test_endpoint "Knowledge Diagnostics" "GET" "/api/knowledge/diag" "$USER_TOKEN" ""
    
    # Introspect knowledge
    knowledge_introspect='{"module_path":"ai.knowledge.pdf","kind":"knowledge"}'
    test_endpoint "Introspect Knowledge" "POST" "/api/knowledge/introspect" "$USER_TOKEN" "$knowledge_introspect"
else
    echo "⚠️ Skipping knowledge tests (no user token)"
fi

# ============================================== 
# 13. AGENTS ROUTER TESTS (/api/agents prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🤖 13. AGENTS ROUTER TESTS (/api/agents)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get all agents
    test_endpoint "Get All Agents" "GET" "/api/agents" "$USER_TOKEN" ""
    
    # Get specific agent
    test_endpoint "Get Specific Agent" "GET" "/api/agents/test_agent" "$USER_TOKEN" ""
    
    # Create agent
    agent_data='{"name":"test_agent","description":"Test agent","config":{}}'
    test_endpoint "Create Agent" "POST" "/api/agents" "$USER_TOKEN" "$agent_data"
    
    # Delete agent
    test_endpoint "Delete Agent" "DELETE" "/api/agents/test_agent" "$USER_TOKEN" ""
else
    echo "⚠️ Skipping agent tests (no user token)"
fi

# ============================================== 
# 14. AGENT RUNTIME ROUTER TESTS (/api/agent-runtime prefix in router)
# ==============================================

echo ""
echo "=============================================="
echo "🚀 14. AGENT RUNTIME ROUTER TESTS (/api/agent-runtime)"
echo "=============================================="

if [ -n "$USER_TOKEN" ]; then
    # Get conversations
    test_endpoint "Get Agent Conversations" "GET" "/api/agent-runtime/conversations" "$USER_TOKEN" ""
    
    # Get specific conversation
    test_endpoint "Get Specific Conversation" "GET" "/api/agent-runtime/conversations/test_conv_id" "$USER_TOKEN" ""
    
    # Create conversation
    conv_data='{"agent_name":"test_agent","title":"Test Conversation"}'
    test_endpoint "Create Conversation" "POST" "/api/agent-runtime/conversations" "$USER_TOKEN" "$conv_data"
    
    # Delete conversation
    test_endpoint "Delete Conversation" "DELETE" "/api/agent-runtime/conversations/test_conv_id" "$USER_TOKEN" ""
    
    # Run agent
    run_data='{"agent_name":"test_agent","message":"Hello","conversation_id":"test_conv_id"}'
    test_endpoint "Run Agent" "POST" "/api/agent-runtime/run" "$USER_TOKEN" "$run_data"
else
    echo "⚠️ Skipping agent runtime tests (no user token)"
fi

# ============================================== 
# FINAL REPORT
# ==============================================

echo ""
echo "=============================================="
echo "📊 FINAL TEST REPORT"
echo "=============================================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
echo ""
echo "Credentials Used:"
echo "- User Email: $USER_EMAIL"
echo "- User Password: $USER_PASSWORD"
echo "- Admin User: $ADMIN_USER"
echo "- Admin Password: $ADMIN_PASS"
echo ""
echo "Notes:"
echo "- Some tests may fail if endpoints require specific data or authentication"
echo "- Create dummy user first: python3 create_dummy_user_and_test.py"
echo "- Ensure the server is running: python backend_python/main.py"
echo "=============================================="
