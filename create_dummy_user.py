#!/usr/bin/env python3
"""
Simple script to create a dummy user via MongoDB directly
"""

import pymongo
import bcrypt
import uuid
from datetime import datetime
import json

# MongoDB connection
MONGO_URI = "mongodb://localhost:8801"
DB_NAME = "giap"

# Dummy user data
USER_EMAIL = "test@example.com"
USER_PASSWORD = "testpassword123"
USER_NAME = "Test User"

def hash_password(password: str) -> str:
    """Hash password with bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_dummy_user():
    """Create dummy user directly in MongoDB"""
    try:
        # Connect to MongoDB
        print("🔄 Connecting to MongoDB...")
        client = pymongo.MongoClient(MONGO_URI)
        db = client[DB_NAME]
        
        # Check if user exists
        existing_user = db.users.find_one({"email": USER_EMAIL})
        if existing_user:
            print(f"✅ User {USER_EMAIL} already exists!")
            print(f"User ID: {existing_user.get('id', 'N/A')}")
            return existing_user.get('id')
        
        # Generate user data
        user_id = str(uuid.uuid4())
        hashed_password = hash_password(USER_PASSWORD)
        tenant_id = str(uuid.uuid4())  # Simple tenant ID
        
        print(f"🔄 Creating user: {USER_EMAIL}")
        
        # Create tenant first
        tenant_data = {
            "tenantId": tenant_id,
            "name": f"{USER_EMAIL} Tenant",
            "ownerId": user_id,
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "active": True
        }
        
        try:
            db.tenants.insert_one(tenant_data)
            print(f"✅ Tenant created: {tenant_id}")
        except Exception as e:
            print(f"⚠️ Tenant creation warning: {e}")
        
        # Create user
        user_data = {
            "id": user_id,
            "role": "user",
            "active": True,
            "password": hashed_password,
            "createdAt": datetime.utcnow().timestamp() * 1000,
            "firstName": "Test",
            "lastName": "User", 
            "name": USER_NAME,
            "email": USER_EMAIL,
            "emailOriginal": USER_EMAIL,
            "isInvited": False,
            "tenantId": tenant_id
        }
        
        db.users.insert_one(user_data)
        print(f"✅ User created with ID: {user_id}")
        
        # Create a basic role for the user
        role_id = str(uuid.uuid4())
        role_data = {
            "roleId": role_id,
            "roleName": f"{USER_EMAIL}_personal",
            "ownerId": user_id,
            "tenantId": tenant_id,
            "permissions": ["read", "write"],
            "isDefault": True,
            "immutable": True,
            "createdAt": datetime.utcnow().timestamp() * 1000
        }
        
        try:
            db.roles.insert_one(role_data)
            print(f"✅ Role created: {role_id}")
            
            # Assign role to user
            user_role_data = {
                "userId": user_id,
                "roleId": role_id,
                "assignedAt": datetime.utcnow().timestamp() * 1000
            }
            db.userRoles.insert_one(user_role_data)
            print(f"✅ Role assigned to user")
            
        except Exception as e:
            print(f"⚠️ Role creation warning: {e}")
        
        client.close()
        return user_id
        
    except Exception as e:
        print(f"❌ Error creating user: {e}")
        return None

def test_login():
    """Test login with the created user"""
    import requests
    
    print(f"\n🔄 Testing login for {USER_EMAIL}...")
    
    try:
        response = requests.post("http://localhost:4000/login", json={
            "username": USER_EMAIL,
            "password": USER_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print(f"✅ Login successful!")
            print(f"Token: {token[:50]}...")
            print(f"Role: {data.get('role')}")
            print(f"Name: {data.get('name')}")
            return token
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

if __name__ == "__main__":
    print("🚀 Creating Dummy User for GIA Platform")
    print("=" * 50)
    
    user_id = create_dummy_user()
    
    if user_id:
        print(f"\n✅ User creation completed!")
        print(f"📧 Email: {USER_EMAIL}")
        print(f"🔐 Password: {USER_PASSWORD}")
        print(f"🆔 User ID: {user_id}")
        
        # Test login
        token = test_login()
        
        if token:
            print(f"\n🎉 Ready to test API endpoints!")
            print(f"You can now run: ./test_api_endpoints.sh")
        else:
            print(f"\n⚠️ User created but login failed. Check backend logs.")
    else:
        print(f"\n❌ User creation failed!")
