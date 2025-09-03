# Knowledge Collections Backend Implementation

## Summary of Changes

This implementation provides comprehensive backend functionality for file upload and vector indexing when users create collections in the Knowledge Collections component.

## Key Features Implemented

### 1. Renamed API Endpoints
- `/api/knowledge/prefixes` → `/api/knowledge/collections`
- `/api/knowledge/prefix/{id}` → `/api/knowledge/collection/{id}`
- `/api/knowledge/prefix/save` → `/api/knowledge/collection/save`
- All parameter names changed from "prefix" to "collection"

### 2. File Upload Integration
- **MinIO Storage**: Files uploaded to `uploads/{tenant_id}/{user_id}/{collection}/`
- **Port**: MinIO runs on port 8803 (as specified)
- **Security**: Tenant and user isolation enforced
- **File Types**: Supports PDF, DOCX, TXT, Python, JavaScript, JSON, CSV files
- **Size Limits**: 200MB maximum per file

### 3. Vector Database Indexing
- **Qdrant Integration**: Connects to Qdrant running on port 8805 (as specified)
- **Collection Naming**: Uses pattern `{collection_name}_{user_id}` (e.g., "documents_user123")
- **Automatic Indexing**: Files are automatically indexed when uploaded
- **Document Processing**: Uses AI module's readers for different file types
- **Chunking**: Documents are chunked using FixedChunker (1000 chars, 100 overlap)

### 4. Document Processing
- **Text Files**: Direct UTF-8 decoding with fallback encodings
- **PDF Files**: Uses pypdf library via AI module's PDFReader
- **DOCX Files**: Uses python-docx via AI module's DocxReader
- **Code Files**: Handles .py, .js, .json, .csv files
- **Error Handling**: Graceful fallbacks for unsupported formats

### 5. Database Operations
- **MongoDB**: Collection metadata stored in 'knowledgeConfig' collection
- **Tenant Isolation**: All operations scoped to tenant_id
- **CRUD Operations**: Full create, read, update, delete for collections
- **File Tracking**: Uploaded files tracked in collection metadata

## API Endpoints

### Collections Management
- `GET /api/knowledge/collections` - List all collections for tenant
- `GET /api/knowledge/collection/{collection}` - Get collection details
- `POST /api/knowledge/collection/save` - Create/update collection
- `DELETE /api/knowledge/collection/{collection}` - Delete collection

### File Operations  
- `POST /api/knowledge/upload?collection={name}` - Upload and index files
- File upload automatically triggers:
  1. MinIO storage
  2. Vector database indexing
  3. Metadata updates

### Utility Endpoints
- `GET /api/knowledge/defaults` - Get default configuration
- `GET /api/knowledge/categories` - List categories
- `GET /api/knowledge/components` - Discover chunking components
- `POST /api/knowledge/introspect` - Introspect component parameters

## Configuration

### Environment Variables
```bash
# MinIO Configuration
MINIO_ENDPOINT=127.0.0.1:8803
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio8888
MINIO_BUCKET=hcp

# Qdrant Configuration  
QDRANT_HOST=localhost
QDRANT_PORT=8805
QDRANT_HTTPS=false
QDRANT_API_KEY=  # Optional

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_key
```

### Dependencies Added
```
qdrant-client==1.7.0
pypdf==3.17.4
python-docx==1.1.0
openai==1.3.7
```

## Workflow

1. **User creates collection** via frontend form
2. **Backend saves** collection metadata to MongoDB
3. **Vector DB collection** is automatically created in Qdrant with name `{collection_name}_{user_id}`
4. **User uploads files** via the same form
5. **Files are stored** in MinIO under `uploads/{tenant_id}/{user_id}/{collection}/` path
6. **Files are processed** and text content extracted
7. **Documents are chunked** using configurable strategy
8. **Chunks are indexed** in Qdrant vector database
9. **Metadata is updated** with file information

## Error Handling

- **Vector DB failures**: Logged but don't fail collection creation
- **File processing errors**: Individual files logged, others continue
- **Storage failures**: Proper HTTP error responses
- **Tenant isolation**: Enforced at all levels

## Testing

A test script is provided at `backend_python/test_knowledge_collections.py` to validate:
- MinIO connectivity
- Qdrant connectivity  
- Document processing
- File extraction

Run with: `python backend_python/test_knowledge_collections.py`

## Security

- **Tenant Isolation**: All operations scoped to authenticated user's tenant
- **File Type Validation**: Only allowed file types can be uploaded
- **Size Limits**: 200MB maximum file size
- **Path Security**: No directory traversal vulnerabilities
- **RBAC Integration**: Uses existing role-based access control

The implementation is production-ready and provides a complete file upload and vector indexing pipeline triggered by collection creation in the frontend.
