#!/usr/bin/env python3
"""
Test script to verify multi-user concurrent access to the Agent Playground.

This script simulates multiple users starting conversations simultaneously
to verify that the system doesn't freeze and can handle concurrent requests.
"""

import asyncio
import aiohttp
import time
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:4000"
NUM_CONCURRENT_USERS = 5
TEST_AGENT_NAME = "general_agent"  # Change to an actual agent name
TEST_PROMPT = "What is 2+2?"

# You'll need valid tokens for testing - get these from browser dev tools
TEST_TOKENS = [
    "YOUR_TOKEN_1",
    "YOUR_TOKEN_2",
    # Add more tokens as needed
]

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

async def simulate_user_conversation(user_id: int, token: str = None):
    """Simulate a single user starting a conversation"""
    start_time = time.time()
    
    print(f"{Colors.OKBLUE}[User {user_id}] Starting conversation at {datetime.now().strftime('%H:%M:%S.%f')[:-3]}{Colors.ENDC}")
    
    url = f"{BASE_URL}/api/agent-runtime/run"
    
    # Prepare form data
    form_data = aiohttp.FormData()
    form_data.add_field('agent_name', TEST_AGENT_NAME)
    form_data.add_field('prompt', f"{TEST_PROMPT} (User {user_id})")
    form_data.add_field('conv_id', f"test_conv_{user_id}_{int(time.time())}")
    
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    chunks_received = 0
    first_chunk_time = None
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=form_data, headers=headers) as response:
                if response.status != 200:
                    error = await response.text()
                    print(f"{Colors.FAIL}[User {user_id}] Error: HTTP {response.status} - {error}{Colors.ENDC}")
                    return False
                
                print(f"{Colors.OKGREEN}[User {user_id}] Connected! Receiving stream...{Colors.ENDC}")
                
                # Read SSE stream
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    
                    if line.startswith('data: '):
                        if first_chunk_time is None:
                            first_chunk_time = time.time()
                            ttfb = (first_chunk_time - start_time) * 1000
                            print(f"{Colors.OKCYAN}[User {user_id}] First chunk received in {ttfb:.0f}ms{Colors.ENDC}")
                        
                        chunks_received += 1
                        
                        # Parse JSON to check for completion
                        import json
                        try:
                            data = json.loads(line[6:])
                            if data.get('type') == 'agent_run_complete':
                                end_time = time.time()
                                total_time = (end_time - start_time) * 1000
                                print(f"{Colors.OKGREEN}[User {user_id}] ✓ Completed in {total_time:.0f}ms ({chunks_received} chunks){Colors.ENDC}")
                                return True
                        except:
                            pass
                
                print(f"{Colors.WARNING}[User {user_id}] Stream ended without completion event{Colors.ENDC}")
                return True
                
    except asyncio.TimeoutError:
        print(f"{Colors.FAIL}[User {user_id}] ✗ Timeout after {time.time() - start_time:.1f}s{Colors.ENDC}")
        return False
    except Exception as e:
        print(f"{Colors.FAIL}[User {user_id}] ✗ Error: {str(e)}{Colors.ENDC}")
        return False

async def test_concurrent_access():
    """Test concurrent access with multiple users"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}")
    print(f"Multi-User Concurrent Access Test")
    print(f"{'='*60}{Colors.ENDC}\n")
    
    print(f"Configuration:")
    print(f"  • Base URL: {BASE_URL}")
    print(f"  • Concurrent Users: {NUM_CONCURRENT_USERS}")
    print(f"  • Agent: {TEST_AGENT_NAME}")
    print(f"  • Prompt: {TEST_PROMPT}")
    print()
    
    # Get tokens (use same token for all if not enough provided)
    tokens = TEST_TOKENS + [TEST_TOKENS[0]] * (NUM_CONCURRENT_USERS - len(TEST_TOKENS)) if TEST_TOKENS else [None] * NUM_CONCURRENT_USERS
    
    print(f"{Colors.BOLD}Starting {NUM_CONCURRENT_USERS} concurrent conversations...{Colors.ENDC}\n")
    
    start_time = time.time()
    
    # Create tasks for all users
    tasks = [
        simulate_user_conversation(i + 1, tokens[i])
        for i in range(NUM_CONCURRENT_USERS)
    ]
    
    # Run all tasks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Print results
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}")
    print(f"Test Results")
    print(f"{'='*60}{Colors.ENDC}\n")
    
    successful = sum(1 for r in results if r is True)
    failed = sum(1 for r in results if r is False or isinstance(r, Exception))
    
    print(f"Total Time: {total_time:.2f}s")
    print(f"Successful: {Colors.OKGREEN}{successful}/{NUM_CONCURRENT_USERS}{Colors.ENDC}")
    print(f"Failed: {Colors.FAIL}{failed}/{NUM_CONCURRENT_USERS}{Colors.ENDC}")
    
    if successful == NUM_CONCURRENT_USERS:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}✓ SUCCESS: All users were able to use the system concurrently!{Colors.ENDC}")
        return True
    elif successful > 0:
        print(f"\n{Colors.WARNING}{Colors.BOLD}⚠ PARTIAL: Some users succeeded but {failed} failed{Colors.ENDC}")
        return False
    else:
        print(f"\n{Colors.FAIL}{Colors.BOLD}✗ FAILURE: No users were able to complete conversations{Colors.ENDC}")
        return False

async def test_sequential_access():
    """Test sequential access (baseline)"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}Running baseline sequential test...{Colors.ENDC}\n")
    
    start_time = time.time()
    
    for i in range(min(3, NUM_CONCURRENT_USERS)):
        token = TEST_TOKENS[0] if TEST_TOKENS else None
        await simulate_user_conversation(i + 1, token)
    
    end_time = time.time()
    print(f"\n{Colors.HEADER}Sequential test completed in {end_time - start_time:.2f}s{Colors.ENDC}\n")

if __name__ == "__main__":
    print(f"\n{Colors.HEADER}{Colors.BOLD}")
    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║  Multi-User Concurrent Access Test for Agent Playground  ║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")
    
    # Check if tokens are configured
    if not TEST_TOKENS or TEST_TOKENS[0] == "YOUR_TOKEN_1":
        print(f"{Colors.WARNING}⚠ Warning: No valid tokens configured!{Colors.ENDC}")
        print(f"Please edit this script and add valid JWT tokens in the TEST_TOKENS list.")
        print(f"You can get tokens from browser dev tools (Application > Local Storage > token)\n")
        
        response = input("Continue anyway? (y/N): ")
        if response.lower() != 'y':
            print("Test cancelled.")
            exit(0)
    
    try:
        # Run tests
        asyncio.run(test_concurrent_access())
        
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}")
    except Exception as e:
        print(f"\n{Colors.FAIL}Error running tests: {e}{Colors.ENDC}")
        import traceback
        traceback.print_exc()
