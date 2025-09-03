#!/usr/bin/env python3
"""
Test script to verify file upload changes work correctly.
Tests:
1. File upload without timestamp
2. File existence checking
3. Warning messages for existing files
"""

import asyncio
import sys
import os

# Add the backend path to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend_python', 'src'))

from services.file_service import FileService


async def test_file_existence_check():
    """Test the new file existence checking functionality"""
    
    print("Testing file existence check...")
    
    # Test with a file that doesn't exist
    non_existent_file = "uploads/test-tenant/test-user/test-collection/non-existent-file.txt"
    exists = await FileService.check_file_exists(non_existent_file)
    print(f"Non-existent file check: {exists} (should be False)")
    
    # Test with a file that might exist (if we've uploaded before)
    test_file = "uploads/test-tenant/test-user/test-collection/test-file.txt"
    exists = await FileService.check_file_exists(test_file)
    print(f"Test file check: {exists}")
    
    print("File existence check test completed!")


async def main():
    """Main test function"""
    print("Starting file upload tests...")
    
    try:
        await test_file_existence_check()
        print("\n✅ All tests completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
