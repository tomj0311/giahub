#!/usr/bin/env python3
"""
Test script for Knowledge Collections functionality
Tests the upload and indexing workflow
"""

import asyncio
import os
import tempfile
from pathlib import Path

# Add the backend_python directory to the Python path
import sys
sys.path.insert(0, '/home/tom/Desktop/giahub/backend_python')
sys.path.insert(0, '/home/tom/Desktop/giahub')

async def test_vector_db_connection():
    """Test connection to Qdrant vector database"""
    try:
        from ai.vectordb.qdrant import Qdrant
        from ai.embedder.openai import OpenAIEmbedder
        
        # Test collection using new naming: collectionname_user@userid
        test_collection = "test_collection_user@user123"
        
        vector_db = Qdrant(
            collection=test_collection,
            host="localhost",
            port=8805,
            https=False,
            embedder=OpenAIEmbedder()
        )
        
        print("✓ Vector DB connection established")
        print(f"  Collection naming format: {test_collection}")
        return True
    except Exception as e:
        print(f"✗ Vector DB connection failed: {e}")
        return False

async def test_minio_connection():
    """Test connection to MinIO storage"""
    try:
        from minio import Minio
        
        client = Minio(
            "127.0.0.1:8803",
            access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minio8888"),
            secure=False
        )
        
        # Test bucket access
        bucket_name = "hcp"  # Default bucket name
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
        
        print("✓ MinIO connection established")
        print(f"  Using bucket: {bucket_name}")
        print("  Path structure: uploads/tenant_id/user_id/collection/files")
        return True
    except Exception as e:
        print(f"✗ MinIO connection failed: {e}")
        return False

async def test_document_processing():
    """Test document processing functionality"""
    try:
        from ai.document import Document
        from ai.document.chunking.fixed import FixedChunker
        
        # Create a test document
        test_content = "This is a test document for knowledge collection indexing. " * 10
        doc = Document(
            content=test_content,
            meta={"filename": "test.txt", "collection": "test"}
        )
        
        # Test chunking
        chunker = FixedChunker(chunk_size=100, chunk_overlap=20)
        chunks = chunker.chunk([doc])
        
        print(f"✓ Document processing works - created {len(chunks)} chunks")
        return True
    except Exception as e:
        print(f"✗ Document processing failed: {e}")
        return False

async def test_file_extraction():
    """Test file content extraction"""
    try:
        # Test with a text file
        from backend_python.src.routes.knowledge import _extract_text_from_file
        
        test_content = "This is a test file content for extraction."
        extracted = await _extract_text_from_file("test.txt", test_content.encode())
        
        if extracted.strip() == test_content:
            print("✓ File extraction works")
            return True
        else:
            print(f"✗ File extraction failed - expected '{test_content}', got '{extracted}'")
            return False
    except Exception as e:
        print(f"✗ File extraction failed: {e}")
        return False

async def main():
    """Run all tests"""
    print("Testing Knowledge Collections Backend Functionality")
    print("=" * 50)
    
    tests = [
        ("MinIO Connection", test_minio_connection),
        ("Vector DB Connection", test_vector_db_connection),
        ("Document Processing", test_document_processing),
        ("File Extraction", test_file_extraction),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\nTesting {test_name}...")
        result = await test_func()
        results.append((test_name, result))
    
    print("\n" + "=" * 50)
    print("Test Results:")
    for test_name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {test_name}: {status}")
    
    all_passed = all(result for _, result in results)
    if all_passed:
        print("\n✓ All tests passed! Backend functionality is ready.")
    else:
        print("\n✗ Some tests failed. Check the setup:")
        print("  - Ensure Qdrant is running on port 8805")
        print("  - Ensure MinIO is running on port 8803")
        print("  - Check environment variables for API keys")

if __name__ == "__main__":
    asyncio.run(main())
