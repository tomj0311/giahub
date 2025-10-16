#!/bin/bash
# Run GiaHub backend with nohup in background

cd /home/tom/giahub/backend

# Kill existing process if running
pkill -f "python3.*main.py" 2>/dev/null

# Start with nohup
nohup python main.py > /home/tom/giahub/logs/giahub.log 2>&1 &

PID=$!
echo "✅ GiaHub backend started with PID: $PID"
echo "📋 View logs with: tail -f /home/tom/giahub/logs/giahub.log"
echo "🛑 Stop with: pkill -f 'python.*main.py'"
echo $PID > /home/tom/giahub/giahub.pid
