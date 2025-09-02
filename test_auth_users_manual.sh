#!/bin/bash

# Manual API Testing Script for Auth & Users Routes
# Test all endpoints using curl commands

API_BASE="http://localhost:4000"
ADMIN_USER="admin"
ADMIN_PASS="123"

# Generate unique test user
TIMESTAMP=$(date +%s)
TEST_EMAIL="test_${TIMESTAMP}@example.com"
TEST_PASSWORD="testpassword123"

echo "🚀 Manual API Testing - Auth & Users Routes"
echo "============================================="
echo "API Base: $API_BASE"
echo "Test Email: $TEST_EMAIL"
echo "============================================="

# Helper function to make requests with pretty output
make_request() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local headers="$5"
    
    echo ""
    echo "📍 Testing: $name"
    echo "   $method $API_BASE$endpoint"
    
    if [ -n "$data" ]; then
        echo "   Data: $data"
    fi
    
    echo "   Response:"
    
    if [ "$method" = "GET" ]; then
        if [ -n "$headers" ]; then
            curl -s -w "\n   Status: %{http_code}\n" -H "$headers" "$API_BASE$endpoint" | jq . 2>/dev/null || curl -s -w "\n   Status: %{http_code}\n" -H "$headers" "$API_BASE$endpoint"
        else
            curl -s -w "\n   Status: %{http_code}\n" "$API_BASE$endpoint" | jq . 2>/dev/null || curl -s -w "\n   Status: %{http_code}\n" "$API_BASE$endpoint"
        fi
    else
        if [ -n "$headers" ]; then
            curl -s -w "\n   Status: %{http_code}\n" -X "$method" -H "Content-Type: application/json" -H "$headers" -d "$data" "$API_BASE$endpoint" | jq . 2>/dev/null || curl -s -w "\n   Status: %{http_code}\n" -X "$method" -H "Content-Type: application/json" -H "$headers" -d "$data" "$API_BASE$endpoint"
        else
            curl -s -w "\n   Status: %{http_code}\n" -X "$method" -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint" | jq . 2>/dev/null || curl -s -w "\n   Status: %{http_code}\n" -X "$method" -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint"
        fi
    fi
    
    echo ""
    echo "---"
}

echo ""
echo "🔐 AUTH ROUTES TESTING"
echo "====================="

# 1. Admin Login
ADMIN_TOKEN=$(make_request "Admin Login" "POST" "/auth/login" \
    '{"username":"'$ADMIN_USER'","password":"'$ADMIN_PASS'"}' | grep '"token"' | cut -d'"' -f4)

# 2. Invalid Login
make_request "Invalid Login" "POST" "/auth/login" \
    '{"username":"invalid","password":"invalid"}'

# 3. Missing Credentials
make_request "Missing Credentials" "POST" "/auth/login" \
    '{}'

# 4. Get Current User (Admin)
if [ -n "$ADMIN_TOKEN" ]; then
    echo "Admin token: ${ADMIN_TOKEN:0:20}..."
    make_request "Get Current User (Admin)" "GET" "/auth/me" "" \
        "Authorization: Bearer $ADMIN_TOKEN"
fi

# 5. Get Current User (No Token)
make_request "Get Current User (No Token)" "GET" "/auth/me"

# 6. Logout
if [ -n "$ADMIN_TOKEN" ]; then
    make_request "Logout" "POST" "/auth/logout" "" \
        "Authorization: Bearer $ADMIN_TOKEN"
fi

# 7. Google OAuth (will redirect or error)
make_request "Google OAuth Init" "GET" "/auth/google"

echo ""
echo "👥 USERS ROUTES TESTING"
echo "======================="

# 1. User Registration
USER_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"firstName":"Test","lastName":"User","email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'","confirmPassword":"'$TEST_PASSWORD'"}' \
    "$API_BASE/api/users/")

echo "📍 Testing: User Registration"
echo "   POST $API_BASE/api/users/"
echo "   Response:"
echo "$USER_RESPONSE" | jq . 2>/dev/null || echo "$USER_RESPONSE"
echo ""

# Extract verification token
VERIFY_TOKEN=$(echo "$USER_RESPONSE" | grep '"verifyToken"' | cut -d'"' -f4)
if [ -n "$VERIFY_TOKEN" ]; then
    echo "Verification token: $VERIFY_TOKEN"
fi

# 2. Duplicate Email Registration
make_request "Duplicate Email Registration" "POST" "/api/users/" \
    '{"firstName":"Test","lastName":"User","email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'","confirmPassword":"'$TEST_PASSWORD'"}'

# 3. Invalid Password (too short)
make_request "Invalid Password (Too Short)" "POST" "/api/users/" \
    '{"firstName":"Test","lastName":"User","email":"test_short@example.com","password":"123","confirmPassword":"123"}'

# 4. Password Mismatch
make_request "Password Mismatch" "POST" "/api/users/" \
    '{"firstName":"Test","lastName":"User","email":"test_mismatch@example.com","password":"password123","confirmPassword":"different"}'

# 5. User Login (Before Verification)
make_request "User Login (Before Verification)" "POST" "/api/users/login" \
    '{"email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'"}'

# 6. User Verification
if [ -n "$VERIFY_TOKEN" ]; then
    make_request "User Verification" "POST" "/api/users/verify" \
        '{"token":"'$VERIFY_TOKEN'"}'
fi

# 7. Invalid Verification Token
make_request "Invalid Verification Token" "POST" "/api/users/verify" \
    '{"token":"invalid_token"}'

# 8. User Login (After Verification)
make_request "User Login (After Verification)" "POST" "/api/users/login" \
    '{"email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'"}'

# 9. Invalid User Login
make_request "Invalid User Login" "POST" "/api/users/login" \
    '{"email":"nonexistent@example.com","password":"wrongpassword"}'

# 10. Get Users List (Admin)
if [ -n "$ADMIN_TOKEN" ]; then
    make_request "Get Users List (Admin)" "GET" "/api/users/" "" \
        "Authorization: Bearer $ADMIN_TOKEN"
fi

# 11. Get Users List (No Token)
make_request "Get Users List (No Token)" "GET" "/api/users/"

# 12-15. Legacy Routes
echo ""
echo "🗂️ LEGACY ROUTES TESTING"
echo "========================"

make_request "Legacy Patients Registration" "POST" "/api/users/patients" \
    '{}'

make_request "Legacy Patients Verification" "POST" "/api/users/patients/verify" \
    '{}'

make_request "Legacy Patients Login" "POST" "/api/users/patients/login" \
    '{}'

make_request "Legacy Get Patients" "GET" "/api/users/patients"

echo ""
echo "✅ All tests completed!"
echo ""
echo "📋 SUMMARY OF TESTED ENDPOINTS:"
echo ""
echo "AUTH ROUTES (/auth):"
echo "  POST   /auth/login"
echo "  GET    /auth/me"
echo "  POST   /auth/logout"
echo "  GET    /auth/google"
echo "  GET    /auth/google/callback (not tested - OAuth flow)"
echo ""
echo "USERS ROUTES (/api/users):"
echo "  POST   /api/users/"
echo "  POST   /api/users/verify"
echo "  POST   /api/users/login"
echo "  GET    /api/users/"
echo "  POST   /api/users/patients (legacy)"
echo "  POST   /api/users/patients/verify (legacy)"
echo "  POST   /api/users/patients/login (legacy)"
echo "  GET    /api/users/patients (legacy)"
echo ""
echo "🔍 For detailed programmatic testing results, check: auth_users_test_results.json"
