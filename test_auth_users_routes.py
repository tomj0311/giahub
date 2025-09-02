#!/usr/bin/env python3

"""
Comprehensive API Test Script for Auth and Users Routes
Tests all endpoints in:
- app.include_router(auth_router, prefix="/auth")
- app.include_router(users_router, prefix="/api/users")
"""

import requests
import json
import time
import uuid
from typing import Dict, Any, Optional

# Configuration
API_BASE = "http://localhost:4000"
ADMIN_USER = "admin"
ADMIN_PASS = "123"

# Test data
TEST_USER_EMAIL = f"test_{uuid.uuid4().hex[:8]}@example.com"
TEST_USER_PASSWORD = "testpassword123"
TEST_USER_FIRSTNAME = "Test"
TEST_USER_LASTNAME = "User"

# Test counters
TOTAL_TESTS = 0
PASSED_TESTS = 0
FAILED_TESTS = 0

# Test results storage
test_results = []
tokens = {}

def log_test(name: str, method: str, endpoint: str, expected_status, 
             actual_status: int, response_data: Any, success: bool, error: str = None):
    """Log test results"""
    global TOTAL_TESTS, PASSED_TESTS, FAILED_TESTS
    
    TOTAL_TESTS += 1
    if success:
        PASSED_TESTS += 1
        status = "✅ PASS"
    else:
        FAILED_TESTS += 1
        status = "❌ FAIL"
    
    test_results.append({
        "name": name,
        "method": method,
        "endpoint": endpoint,
        "expected_status": expected_status,
        "actual_status": actual_status,
        "success": success,
        "error": error,
        "response": response_data
    })
    
    print(f"[{TOTAL_TESTS}] {status} {name}")
    print(f"    {method} {endpoint}")
    print(f"    Expected: {expected_status}, Got: {actual_status}")
    if error:
        print(f"    Error: {error}")
    if response_data and isinstance(response_data, dict):
        print(f"    Response: {json.dumps(response_data, indent=2)[:200]}...")
    print()

def test_endpoint(name: str, method: str, endpoint: str, expected_status: int = 200,
                 headers: Dict[str, str] = None, data: Dict[str, Any] = None,
                 json_data: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
    """Test a single endpoint"""
    try:
        url = f"{API_BASE}{endpoint}"
        
        # Default headers
        if headers is None:
            headers = {"Content-Type": "application/json"}
        
        # Make request
        if method.upper() == "GET":
            response = requests.get(url, headers=headers)
        elif method.upper() == "POST":
            if json_data:
                response = requests.post(url, headers=headers, json=json_data)
            else:
                response = requests.post(url, headers=headers, data=data)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=json_data)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        # Parse response
        try:
            response_data = response.json()
        except:
            response_data = response.text
        
        # Check status
        if isinstance(expected_status, list):
            success = response.status_code in expected_status
        else:
            success = response.status_code == expected_status
        error = None if success else f"Status code mismatch"
        
        log_test(name, method, endpoint, expected_status, response.status_code, 
                response_data, success, error)
        
        return response_data if success else None
        
    except Exception as e:
        log_test(name, method, endpoint, expected_status, -1, None, False, str(e))
        return None

def run_auth_tests():
    """Test all auth endpoints"""
    print("🔐 Testing AUTH Routes (/auth)")
    print("=" * 50)
    
    # Test 1: Admin Login
    print("\n1️⃣ Testing Admin Authentication")
    response = test_endpoint(
        "Admin Login",
        "POST",
        "/auth/login",
        200,
        json_data={
            "username": ADMIN_USER,
            "password": ADMIN_PASS
        }
    )
    
    if response and "token" in response:
        tokens["admin"] = response["token"]
        print(f"    Admin token stored: {response['token'][:20]}...")
    
    # Test 2: Invalid Login
    test_endpoint(
        "Invalid Login",
        "POST",
        "/auth/login",
        401,
        json_data={
            "username": "invalid",
            "password": "invalid"
        }
    )
    
    # Test 3: Missing credentials
    test_endpoint(
        "Missing Credentials",
        "POST",
        "/auth/login",
        422,  # FastAPI returns 422 for validation errors
        json_data={}
    )
    
    # Test 4: Get current user (admin)
    if "admin" in tokens:
        admin_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {tokens['admin']}"
        }
        test_endpoint(
            "Get Current User (Admin)",
            "GET",
            "/auth/me",
            200,
            headers=admin_headers
        )
    
    # Test 5: Get current user (no token)
    test_endpoint(
        "Get Current User (No Token)",
        "GET",
        "/auth/me",
        403  # Your API returns 403 for unauthenticated requests
    )
    
    # Test 6: Logout
    if "admin" in tokens:
        test_endpoint(
            "Logout",
            "POST",
            "/auth/logout",
            200,
            headers=admin_headers
        )
    
    # Test 7: Google OAuth (should redirect or return error)
    test_endpoint(
        "Google OAuth Init",
        "GET",
        "/auth/google",
        200,  # Your API returns 200 for OAuth init
    )
    
    print("\n🔐 Auth Tests Complete")

def run_users_tests():
    """Test all users endpoints"""
    print("\n👥 Testing USERS Routes (/api/users)")
    print("=" * 50)
    
    # Test 1: Register new user
    print("\n1️⃣ Testing User Registration")
    registration_data = {
        "firstName": TEST_USER_FIRSTNAME,
        "lastName": TEST_USER_LASTNAME,
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "confirmPassword": TEST_USER_PASSWORD
    }
    
    response = test_endpoint(
        "User Registration",
        "POST",
        "/api/users/",
        201,
        json_data=registration_data
    )
    
    user_id = None
    verification_token = None
    if response:
        user_id = response.get("id")
        verification_token = response.get("verifyToken")
        print(f"    User ID: {user_id}")
        print(f"    Verification token: {verification_token}")
    
    # Test 2: Duplicate email registration
    test_endpoint(
        "Duplicate Email Registration",
        "POST",
        "/api/users/",
        400,
        json_data=registration_data
    )
    
    # Test 3: Invalid password (too short)
    invalid_registration = registration_data.copy()
    invalid_registration["password"] = "123"
    invalid_registration["confirmPassword"] = "123"
    invalid_registration["email"] = f"test_{uuid.uuid4().hex[:8]}@example.com"
    
    test_endpoint(
        "Invalid Password (Too Short)",
        "POST",
        "/api/users/",
        422,  # Validation error
        json_data=invalid_registration
    )
    
    # Test 4: Password mismatch
    mismatch_registration = registration_data.copy()
    mismatch_registration["confirmPassword"] = "different_password"
    mismatch_registration["email"] = f"test_{uuid.uuid4().hex[:8]}@example.com"
    
    test_endpoint(
        "Password Mismatch",
        "POST",
        "/api/users/",
        422,  # Validation error
        json_data=mismatch_registration
    )
    
    # Test 5: User login (before verification)
    print("\n2️⃣ Testing User Login (Before Verification)")
    test_endpoint(
        "User Login (Before Verification)",
        "POST",
        "/api/users/login",
        403,  # Forbidden - not verified
        json_data={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        }
    )
    
    # Test 6: Verify user
    print("\n3️⃣ Testing User Verification")
    if verification_token:
        test_endpoint(
            "User Verification",
            "POST",
            "/api/users/verify",
            200,
            json_data={"token": verification_token}
        )
    
    # Test 7: Invalid verification token
    test_endpoint(
        "Invalid Verification Token",
        "POST",
        "/api/users/verify",
        400,
        json_data={"token": "invalid_token"}
    )
    
    # Test 8: User login (after verification)
    print("\n4️⃣ Testing User Login (After Verification)")
    response = test_endpoint(
        "User Login (After Verification)",
        "POST",
        "/api/users/login",
        200,
        json_data={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        }
    )
    
    # Test 9: Invalid user login
    test_endpoint(
        "Invalid User Login",
        "POST",
        "/api/users/login",
        401,
        json_data={
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        }
    )
    
    # Test 10: Get users list (requires authentication)
    print("\n5️⃣ Testing Users List")
    if "admin" in tokens:
        admin_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {tokens['admin']}"
        }
        test_endpoint(
            "Get Users List (Admin)",
            "GET",
            "/api/users/",
            200,
            headers=admin_headers
        )
    
    # Test 11: Get users list (no token)
    test_endpoint(
        "Get Users List (No Token)",
        "GET",
        "/api/users/",
        403  # Your API returns 403 for unauthenticated requests
    )
    
    # Legacy routes removed - no longer testing deprecated endpoints
    
    print("\n👥 Users Tests Complete")

def print_summary():
    """Print test summary"""
    print("\n" + "=" * 70)
    print("📊 TEST SUMMARY")
    print("=" * 70)
    print(f"Total Tests: {TOTAL_TESTS}")
    print(f"Passed: {PASSED_TESTS} ✅")
    print(f"Failed: {FAILED_TESTS} ❌")
    print(f"Success Rate: {(PASSED_TESTS/TOTAL_TESTS*100):.1f}%")
    
    if FAILED_TESTS > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if not result["success"]:
                print(f"  - {result['name']}: {result['error']}")
    
    print("\n📋 DETAILED RESULTS:")
    for i, result in enumerate(test_results, 1):
        status = "✅" if result["success"] else "❌"
        print(f"{i:2d}. {status} {result['name']} ({result['actual_status']})")

def main():
    """Run all tests"""
    print("🚀 GIA Platform Auth & Users Routes Test Suite")
    print("=" * 70)
    print(f"API Base URL: {API_BASE}")
    print(f"Test User Email: {TEST_USER_EMAIL}")
    print(f"Admin User: {ADMIN_USER}")
    print("=" * 70)
    
    # Check if server is running
    try:
        response = requests.get(f"{API_BASE}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running")
        else:
            print("❌ Server health check failed")
            return
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return
    
    # Run tests
    run_auth_tests()
    run_users_tests()
    
    # Print summary
    print_summary()
    
    # Save results to file
    with open("auth_users_test_results.json", "w") as f:
        json.dump({
            "summary": {
                "total": TOTAL_TESTS,
                "passed": PASSED_TESTS,
                "failed": FAILED_TESTS,
                "success_rate": PASSED_TESTS/TOTAL_TESTS*100
            },
            "results": test_results
        }, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: auth_users_test_results.json")

if __name__ == "__main__":
    main()
