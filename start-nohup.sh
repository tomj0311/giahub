#!/bin/bash
# Run GiaHub backend with nohup in background

cd /home/tom/Desktop/giahub/backend

# Kill existing process if running
pkill -f "python.*main.py" 2>/dev/null

# Start with nohup
nohup python main.py > /home/tom/Desktop/giahub/logs/giahub.log 2>&1 &

PID=$!
echo "✅ GiaHub backend started with PID: $PID"
echo "📋 View logs with: tail -f /home/tom/Desktop/giahub/logs/giahub.log"
echo "🛑 Stop with: pkill -f 'python.*main.py'"
echo $PID > /home/tom/Desktop/giahub/giahub.pid
