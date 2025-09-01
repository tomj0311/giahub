#!/usr/bin/env python3
"""
Development server startup script for the FastAPI backend
"""
import sys
import os
import subprocess

def main():
    """Run the development server"""
    
    # Check if virtual environment exists
    venv_path = os.path.join(os.path.dirname(__file__), 'venv')
    if not os.path.exists(venv_path):
        print("Creating virtual environment...")
        subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)
        
        # Activate and install requirements
        if os.name == 'nt':  # Windows
            pip_path = os.path.join(venv_path, 'Scripts', 'pip.exe')
        else:  # Unix/Linux/macOS
            pip_path = os.path.join(venv_path, 'bin', 'pip')
        
        print("Installing requirements...")
        subprocess.run([pip_path, 'install', '-r', 'requirements.txt'], check=True)
    
    # Run the development server
    if os.name == 'nt':  # Windows
        python_path = os.path.join(venv_path, 'Scripts', 'python.exe')
    else:  # Unix/Linux/macOS
        python_path = os.path.join(venv_path, 'bin', 'python')
    
    print("Starting FastAPI development server...")
    # On Windows, prefer polling reload to avoid watchdog-related stdin glitches
    # Prepare environment overrides for the child process
    child_env = os.environ.copy()
    if os.name == 'nt':
        child_env.setdefault('WATCHFILES_FORCE_POLLING', '1')
        child_env.setdefault('PYTHONUNBUFFERED', '1')
        child_env.setdefault('PYTHONLEGACYWINDOWSSTDIO', '1')
        # Also set flag so main.py avoids in-process reload when directly run
        child_env.setdefault('UVICORN_RELOAD', 'true')

    cmd = [
        python_path, '-m', 'uvicorn', 'main:app',
        '--host', '0.0.0.0', '--port', '4000',
    '--reload', '--reload-impl', 'statreload', '--reload-dir', 'src', '--reload-dir', '.',
        '--reload-delay', '0.5', '--log-level', 'info', '--no-access-log',
        '--reload-exclude', 'venv', '--reload-exclude', '__pycache__', '--reload-exclude', '.git'
    ]
    subprocess.run(cmd, env=child_env)

if __name__ == '__main__':
    main()
