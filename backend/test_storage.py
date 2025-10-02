#!/usr/bin/env python3
"""
Simple test script to demonstrate file service with both MinIO and disk storage
"""

import os
import asyncio
from io import BytesIO
from fastapi import UploadFile

# Set environment for testing
os.environ["STORAGE_BACKEND"] = "disk"  # Change to "minio" to test MinIO
os.environ["DISK_STORAGE_PATH"] = "/tmp/test_storage"

from src.services.file_service import FileService


class MockUploadFile:
    """Mock UploadFile for testing"""
    def __init__(self, filename: str, content: bytes, content_type: str = "text/plain"):
        self.filename = filename
        self.content = content
        self.content_type = content_type
        self.size = len(content)
    
    async def read(self) -> bytes:
        return self.content


async def test_file_service():
    """Test file service with both storage backends"""
    
    print(f"Testing with storage backend: {FileService.get_storage_backend()}")
    
    # Create test file
    test_content = b"Hello, this is a test file content!"
    test_file = MockUploadFile("test.txt", test_content)
    
    # Test upload
    try:
        result = await FileService.upload_file_to_storage(
            test_file, 
            tenant_id="test_tenant", 
            user_id="test_user", 
            collection="test_collection"
        )
        print(f"✅ Upload successful: {result}")
    except Exception as e:
        print(f"❌ Upload failed: {e}")
        return
    
    file_path = result["file_path"]
    
    # Test file exists
    exists = await FileService.check_file_exists(file_path)
    print(f"✅ File exists check: {exists}")
    
    # Test get content
    try:
        content = await FileService.get_file_content(file_path)
        print(f"✅ Content retrieved: {content == test_content}")
    except Exception as e:
        print(f"❌ Get content failed: {e}")
    
    # Test list files
    try:
        files = await FileService.list_files_in_collection("test_tenant", "test_user", "test_collection")
        print(f"✅ Files in collection: {files}")
    except Exception as e:
        print(f"❌ List files failed: {e}")
    
    # Test delete
    try:
        deleted = await FileService.delete_file_from_storage(file_path)
        print(f"✅ Delete successful: {deleted}")
    except Exception as e:
        print(f"❌ Delete failed: {e}")
    
    # Verify deletion
    exists_after = await FileService.check_file_exists(file_path)
    print(f"✅ File exists after delete: {exists_after}")


async def main():
    """Main test function"""
    print("=== Testing File Service ===")
    
    # Test with disk storage
    os.environ["STORAGE_BACKEND"] = "disk"
    print("\n--- Testing Disk Storage ---")
    await test_file_service()
    
    # Test with MinIO storage (if available)
    try:
        from minio import Minio
        os.environ["STORAGE_BACKEND"] = "minio"
        print("\n--- Testing MinIO Storage ---")
        await test_file_service()
    except ImportError:
        print("\n--- MinIO not available, skipping MinIO tests ---")
    except Exception as e:
        print(f"\n--- MinIO test failed: {e} ---")


if __name__ == "__main__":
    asyncio.run(main())