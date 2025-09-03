"""
Knowledge Configuration and Upload routes (HTTP only)

Features:
- List available chunking components via filesystem discovery
- Introspect a chunking module to get constructor parameters
- CRUD knowledge prefix configurations stored in MongoDB collection 'knowledgeConfig'
- Upload files to MinIO at uploads/{tenant_id}/{user_id}/{prefix}/
"""

from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException

from ..utils.auth import verify_token_middleware
from ..services.knowledge_service import KnowledgeService
from ..utils.log import logger

router = APIRouter(tags=["knowledge"])


@router.get("/defaults")
async def get_defaults(user: dict = Depends(verify_token_middleware)):
    """Return global defaults for knowledge chunking configuration."""
    logger.info("[KNOWLEDGE] Getting global defaults for knowledge chunking")
    try:
        result = await KnowledgeService.get_defaults(user)
        logger.debug(f"[KNOWLEDGE] Retrieved defaults: {result}")
        return result
    except Exception as e:
        logger.error(f"[KNOWLEDGE] Error retrieving defaults: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def list_categories(user: dict = Depends(verify_token_middleware)):
    """Return distinct knowledge categories for the user's tenant."""
    logger.info("[KNOWLEDGE] Listing knowledge categories")
    try:
        result = await KnowledgeService.list_categories(user)
        logger.debug(f"[KNOWLEDGE] Retrieved {len(result)} categories")
        return result
    except Exception as e:
        import traceback
        error_msg = str(e) if str(e) else repr(e)
        logger.error(f"[KNOWLEDGE] Error listing categories: {error_msg}")
        logger.error(f"[KNOWLEDGE] Categories error traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/collections")
async def list_collections(user: dict = Depends(verify_token_middleware)):
    """List knowledge collections for current tenant."""
    logger.info("[KNOWLEDGE] Listing knowledge collections")
    try:
        result = await KnowledgeService.list_collections(user)
        logger.debug(f"[KNOWLEDGE] Retrieved {len(result) if result else 0} collections")
        return result
    except Exception as e:
        import traceback
        error_msg = str(e) if str(e) else repr(e)
        logger.error(f"[KNOWLEDGE] Error listing collections: {error_msg}")
        logger.error(f"[KNOWLEDGE] Collections error traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/collection/{collection}")
async def get_collection(collection: str, user: dict = Depends(verify_token_middleware)):
    """Get collection details with files from MinIO."""
    logger.info(f"[KNOWLEDGE] Getting collection details for: {collection}")
    try:
        result = await KnowledgeService.get_collection(collection, user)
        logger.debug(f"[KNOWLEDGE] Retrieved collection with {len(result.get('files', [])) if result and 'files' in result else 0} files")
        return result
    except Exception as e:
        logger.error(f"[KNOWLEDGE] Error retrieving collection {collection}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/collection/save")
async def save_collection(payload: dict, user: dict = Depends(verify_token_middleware)):
    """Create or update a knowledge collection configuration in MongoDB and trigger indexing."""
    logger.info(f"[KNOWLEDGE] Saving collection: {payload.get('name', 'Unnamed')}")
    logger.debug(f"[KNOWLEDGE] Collection payload: {payload}")
    try:
        result = await KnowledgeService.save_collection(payload, user)
        logger.info(f"[KNOWLEDGE] Successfully saved collection: {payload.get('name', 'Unnamed')}")
        return result
    except Exception as e:
        import traceback
        error_msg = str(e) if str(e) else repr(e)
        logger.error(f"[KNOWLEDGE] Error saving collection: {error_msg}")
        logger.error(f"[KNOWLEDGE] Save error traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.delete("/collection/{collection}")
async def delete_collection(collection: str, user: dict = Depends(verify_token_middleware)):
    """Delete knowledge collection configuration and vector collection."""
    return await KnowledgeService.delete_collection(collection, user)


@router.post("/upload")
async def upload_knowledge_files(
    collection: str = Query(..., description="Knowledge collection name"),
    files: List[UploadFile] = File(...),
    user: dict = Depends(verify_token_middleware)
):
    """Upload files to MinIO under uploads/tenantId/userId/collection/ and index them."""
    return await KnowledgeService.upload_knowledge_files(collection, files, user)


@router.get("/diag")
async def diag():
    """Knowledge service diagnostics."""
    return await KnowledgeService.get_diagnostics()


# Component discovery routes
@router.get("/components")
async def get_knowledge_components(folder: str = "ai.document.chunking", user: dict = Depends(verify_token_middleware)):
    """Discover available knowledge components"""
    try:
        from src.utils.component_discovery import discover_components
        
        components = discover_components(folder=folder)
        return {"components": {folder: components}, "message": "OK"}
    except Exception as e:
        logger.error(f"Error discovering knowledge components: {e}")
        raise HTTPException(status_code=500, detail="Failed to discover knowledge components")


@router.get("/components/chunking")
async def get_chunking_components():
    """Get available chunking components."""
    return await KnowledgeService.discover_chunking_components()


@router.get("/components/chunking/{component_name}")
async def get_chunking_component_details(component_name: str):
    """Get detailed information about a specific chunking component."""
    return await KnowledgeService.get_component_details(component_name)


@router.post("/introspect")
async def introspect_knowledge_component(
    request: dict,
    user: dict = Depends(verify_token_middleware)
):
    """Introspect a knowledge component to get its parameters"""
    try:
        module_path = request.get("module_path")
        kind = request.get("kind", "chunk")
        
        if not module_path:
            raise HTTPException(status_code=400, detail="module_path is required")
            
        result = await KnowledgeService.introspect_component(module_path)
        return result
    except Exception as e:
        logger.error(f"Error introspecting knowledge component: {e}")
        raise HTTPException(status_code=500, detail="Failed to introspect knowledge component")
