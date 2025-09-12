#!/usr/bin/env python3
"""
Test script to verify the vector service model config integration
"""

import sys
import os
import asyncio

# Add the backend_python to Python path
sys.path.append('/home/tom/Desktop/giahub/backend_python')

async def test_vector_service():
    """Test the vector service model config integration"""
    
    # Import the required services
    from src.services.vector_service import VectorService
    
    # Create test user and payload
    test_user = {
        "id": "tCde9FYTsP3PoRhzME00tQ",
        "tenantId": "e3016c53-4a91-485a-bda9-417be6e13c62"
    }
    
    test_payload = {
        "collection": "TEST1",
        "category": "test",
        "model_id": "68c1103d8123075b86baaeb1",
        "overwrite": True
    }
    
    print("=== Testing Vector Service Model Config Integration ===")
    print(f"User: {test_user}")
    print(f"Payload: {test_payload}")
    print()
    
    try:
        print("Testing _get_qdrant_client method...")
        # This should try to get the model config by ID and extract embedder info
        qdrant_config = await VectorService._get_qdrant_client(test_user, test_payload)
        
        print("Qdrant config returned:")
        for key, value in qdrant_config.items():
            if key == "embedder":
                print(f"  {key}: {type(value)} - {value}")
            else:
                print(f"  {key}: {value}")
        
        print("\n✅ Test completed successfully!")
        
        if qdrant_config.get("embedder") is not None:
            print("✅ Embedder was successfully loaded from model config!")
        else:
            print("⚠️  Embedder is None - check model config or embedding strategy")
            
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Run the test
    asyncio.run(test_vector_service())
