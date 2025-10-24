#!/bin/bash
# Run GiaHub backend with nohup in background
# Updated for multi-user concurrent access

cd /home/tom/Desktop/giahub/backend

# Kill existing process if running
pkill -f "uvicorn.*main:app" 2>/dev/null
pkill -f "python3.*main.py" 2>/dev/null

# Wait for processes to terminate
sleep 2

# Start with uvicorn directly for better worker management
nohup uvicorn main:app \
  --host 0.0.0.0 \
  --port 4000 \
  --workers 4 \
  --timeout-keep-alive 75 \
  --limit-concurrency 1000 \
  --backlog 2048 \
  > /home/tom/Desktop/giahub/logs/giahub.log 2>&1 &

PID=$!
echo "✅ GiaHub backend started with PID: $PID (4 workers for concurrent users)"
echo "📋 View logs with: tail -f /home/tom/Desktop/giahub/logs/giahub.log"
echo "🛑 Stop with: pkill -f 'uvicorn.*main:app'"
echo $PID > /home/tom/Desktop/giahub/giahub.pid
