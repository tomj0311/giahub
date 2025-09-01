import json
import logging
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.websockets import WebSocketState

from ..utils.auth import verify_token
from ..utils.component_discovery import discover_components, get_required_params_for_single_module, get_param_defaults

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_connections: Dict[str, str] = {}  # user_id -> connection_id

    async def connect(self, websocket: WebSocket, connection_id: str, user_data: dict = None):
        await websocket.accept()
        self.active_connections[connection_id] = websocket
        
        if user_data and user_data.get('id'):
            self.user_connections[user_data['id']] = connection_id
        
        # Send welcome message
        welcome_msg = {
            "type": "welcome",
            "message": "Connected",
            "role": user_data.get('role', 'guest') if user_data else 'guest'
        }
        await self.send_personal_message(json.dumps(welcome_msg), connection_id)

    def disconnect(self, connection_id: str):
        # Remove from user connections
        user_to_remove = None
        for user_id, conn_id in self.user_connections.items():
            if conn_id == connection_id:
                user_to_remove = user_id
                break
        
        if user_to_remove:
            del self.user_connections[user_to_remove]
        
        # Remove from active connections
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]

    async def send_personal_message(self, message: str, connection_id: str):
        websocket = self.active_connections.get(connection_id)
        if websocket and websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.error(f"Error sending message to {connection_id}: {e}")

    async def broadcast(self, message: str, exclude_connection: str = None):
        for connection_id, websocket in self.active_connections.items():
            if connection_id != exclude_connection and websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {connection_id}: {e}")


manager = ConnectionManager()


async def handle_websocket_message(websocket: WebSocket, message_data: dict, connection_id: str, user_data: dict = None):
    """Handle incoming WebSocket messages"""
    try:
        message_type = message_data.get('type')
        
        if message_type == 'ping':
            response = {
                "type": "pong",
                "time": int(1000 * __import__('time').time()),  # Current timestamp in ms
                "role": user_data.get('role', 'guest') if user_data else 'guest'
            }
            await manager.send_personal_message(json.dumps(response), connection_id)
        
        elif message_type == 'consult_request':
            # Broadcast consultation request to all other connected clients
            payload = {
                "type": "consult_request",
                "from": user_data.get('id') if user_data else message_data.get('user', 'anonymous'),
                "role": user_data.get('role', 'guest') if user_data else 'guest',
                "symptom": message_data.get('symptom', '')
            }
            await manager.broadcast(json.dumps(payload), exclude_connection=connection_id)
        
        else:
            # Unknown message type
            error_response = {
                "type": "error",
                "error": f"Unknown message type: {message_type}"
            }
            await manager.send_personal_message(json.dumps(error_response), connection_id)
            
    except Exception as e:
        error_response = {
            "type": "error",
            "error": "Invalid message format"
        }
        await manager.send_personal_message(json.dumps(error_response), connection_id)


def setup_websocket_routes(app: FastAPI):
    """Setup WebSocket routes on the FastAPI app"""
    
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
        connection_id = f"conn_{id(websocket)}"
        user_data = None
        
        # Try to verify token if provided
        if token:
            try:
                user_data = verify_token(token)
            except Exception:
                # Invalid token, but still allow connection as guest
                pass
        
        await manager.connect(websocket, connection_id, user_data)
        
        try:
            while True:
                # Receive message
                raw_message = await websocket.receive_text()
                
                try:
                    message_data = json.loads(raw_message)
                    await handle_websocket_message(websocket, message_data, connection_id, user_data)
                except json.JSONDecodeError:
                    error_response = {
                        "type": "error",
                        "error": "Invalid JSON format"
                    }
                    await manager.send_personal_message(json.dumps(error_response), connection_id)
                
        except WebSocketDisconnect:
            logger.info(f"WebSocket {connection_id} disconnected")
        except Exception as e:
            logger.error(f"WebSocket error for {connection_id}: {e}")
        finally:
            manager.disconnect(connection_id)
